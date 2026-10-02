/**
 * AiCredentialsService — per-organization AI provider keys.
 *
 * Organizations can store their own OpenAI key from the Settings UI. Every AI
 * feature (chat/RAG, summaries, semantic search) resolves its provider through
 * here: the organization's key first, then the server-wide OPENAI_API_KEY.
 *
 * Keys are encrypted at rest (AES-256-GCM, org id as AAD) and are never
 * returned to clients — only the last 4 characters.
 */

import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  encryptSecret,
  keyHint,
  loadCredentialsEncryptionKey,
  resolveOpenAIKey,
  type AIProvider,
  type ApiKeySource,
  type ResolvedApiKey,
} from '@docuflow/ai';

import { DatabaseService } from '../database/database.service';
import { AI_PROVIDER_FACTORY_TOKEN, AI_PROVIDER_TOKEN, OPENAI_KEY_VERIFIER_TOKEN } from './ai.constants';

export const OPENAI = 'openai';

export type AiProviderFactory = (apiKey: string) => AIProvider;

/** Checks a key against OpenAI. `unreachable` = network/5xx, so we can't tell. */
export type OpenAIKeyVerifier = (apiKey: string) => Promise<'valid' | 'invalid' | 'unreachable'>;

export const verifyOpenAIKeyOnline: OpenAIKeyVerifier = async (apiKey) => {
  try {
    const res = await fetch('https://api.openai.com/v1/models?limit=1', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return 'valid';
    if (res.status === 401 || res.status === 403) return 'invalid';
    return 'unreachable';
  } catch {
    return 'unreachable';
  }
};

export interface AiKeyStatus {
  configured: boolean;
  /** Where the key in effect comes from. */
  source: ApiKeySource | null;
  /** Last 4 characters of the organization key (never the key itself). */
  last4: string | null;
  updatedAt: Date | null;
  updatedBy: { firstName: string | null; lastName: string | null } | null;
  /** False in production when AI_CREDENTIALS_ENCRYPTION_KEY is missing. */
  canStoreKeys: boolean;
}

@Injectable()
export class AiCredentialsService {
  private readonly logger = new Logger(AiCredentialsService.name);
  private readonly encryptionKey: Buffer | null;
  private readonly environmentKey: string | undefined;

  constructor(
    private readonly db: DatabaseService,
    config: ConfigService,
    /** Provider built from OPENAI_API_KEY (the server-wide fallback). */
    @Inject(AI_PROVIDER_TOKEN) private readonly environmentProvider: AIProvider,
    @Inject(AI_PROVIDER_FACTORY_TOKEN) private readonly providerFactory: AiProviderFactory,
    @Inject(OPENAI_KEY_VERIFIER_TOKEN) private readonly verifyKey: OpenAIKeyVerifier,
  ) {
    this.encryptionKey = loadCredentialsEncryptionKey(
      config.get<string>('AI_CREDENTIALS_ENCRYPTION_KEY'),
      config.get<string>('NODE_ENV'),
    );
    // Missing-key warnings are emitted once by config validation.
    this.environmentKey = config.get<string>('OPENAI_API_KEY') || undefined;
  }

  // ── Resolution (used by every AI feature) ────────────────────────────────

  /** The OpenAI key in effect for an organization, or null if none is configured. */
  resolveOpenAIKey(organizationId: string): Promise<ResolvedApiKey | null> {
    return resolveOpenAIKey({
      organizationId,
      encryptionKey: this.encryptionKey,
      environmentKey: this.environmentKey,
      findEncryptedKey: async (orgId) =>
        (
          await this.db.organizationAiCredential.findUnique({
            where: { organizationId_provider: { organizationId: orgId, provider: OPENAI } },
            select: { encryptedKey: true },
          })
        )?.encryptedKey ?? null,
      onDecryptError: (e) =>
        this.logger.error(`Stored OpenAI key for org ${organizationId} could not be decrypted: ${e.message}`),
    });
  }

  /** An AI provider for this organization, or null when no key is configured. */
  async providerFor(organizationId: string): Promise<AIProvider | null> {
    const resolved = await this.resolveOpenAIKey(organizationId);
    if (resolved?.source === 'organization') return this.providerFactory(resolved.apiKey);
    // No org key: the server-wide provider decides whether it is usable.
    return this.environmentProvider.isAvailable() ? this.environmentProvider : null;
  }

  /** Like providerFor, but throws 503 with a user-actionable message. */
  async requireProvider(organizationId: string): Promise<AIProvider> {
    const provider = await this.providerFor(organizationId);
    if (!provider) {
      throw new ServiceUnavailableException(
        'AI is not configured: an admin can add an OpenAI API key in Settings',
      );
    }
    return provider;
  }

  // ── Settings (API for the Settings UI) ───────────────────────────────────

  async getStatus(organizationId: string): Promise<AiKeyStatus> {
    const stored = await this.db.organizationAiCredential.findUnique({
      where: { organizationId_provider: { organizationId, provider: OPENAI } },
      select: {
        keyLast4: true,
        updatedAt: true,
        updatedBy: { select: { firstName: true, lastName: true } },
      },
    });
    const resolved = await this.resolveOpenAIKey(organizationId);

    return {
      configured: resolved !== null,
      source: resolved?.source ?? null,
      last4: stored?.keyLast4 ?? null,
      updatedAt: stored?.updatedAt ?? null,
      updatedBy: stored?.updatedBy ?? null,
      canStoreKeys: this.encryptionKey !== null,
    };
  }

  async setOpenAIKey(organizationId: string, userId: string, apiKey: string): Promise<AiKeyStatus> {
    if (!this.encryptionKey) {
      throw new ServiceUnavailableException(
        'Storing API keys is disabled: the server has no AI_CREDENTIALS_ENCRYPTION_KEY',
      );
    }

    const verdict = await this.verifyKey(apiKey);
    if (verdict === 'invalid') {
      throw new UnprocessableEntityException('OpenAI rejected this API key. Check it and try again.');
    }
    if (verdict === 'unreachable') {
      throw new BadGatewayException("Couldn't reach OpenAI to verify the key. Try again in a moment.");
    }

    const data = {
      encryptedKey: encryptSecret(apiKey, this.encryptionKey, organizationId),
      keyLast4: keyHint(apiKey),
      updatedById: userId,
    };

    await this.db.$transaction([
      this.db.organizationAiCredential.upsert({
        where: { organizationId_provider: { organizationId, provider: OPENAI } },
        create: { organizationId, provider: OPENAI, ...data },
        update: data,
      }),
      this.db.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'ORG_UPDATED',
          resourceType: 'organization',
          resourceId: organizationId,
          // Never the key — only which setting changed and its hint
          metadata: { setting: 'ai.openai_api_key', change: 'set', last4: data.keyLast4 },
        },
      }),
    ]);

    return this.getStatus(organizationId);
  }

  async removeOpenAIKey(organizationId: string, userId: string): Promise<void> {
    const { count } = await this.db.organizationAiCredential.deleteMany({
      where: { organizationId, provider: OPENAI },
    });
    if (count > 0) {
      await this.db.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'ORG_UPDATED',
          resourceType: 'organization',
          resourceId: organizationId,
          metadata: { setting: 'ai.openai_api_key', change: 'removed' },
        },
      });
    }
  }
}
