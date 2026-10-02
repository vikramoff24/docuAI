/**
 * Resolves the OpenAI key for an organization inside the worker: the key an
 * admin stored in Settings (decrypted), else the server-wide OPENAI_API_KEY.
 * Mirrors AiCredentialsService in the API; both use @docuflow/ai's helpers and
 * must share AI_CREDENTIALS_ENCRYPTION_KEY.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  loadCredentialsEncryptionKey,
  resolveOpenAIKey,
  type AIProvider,
  type ResolvedApiKey,
} from '@docuflow/ai';

import { WorkerDatabaseService } from '../database/worker-database.service';

export const AI_PROVIDER = 'AI_PROVIDER';
export const AI_PROVIDER_FACTORY = 'AI_PROVIDER_FACTORY';
export type AiProviderFactory = (apiKey: string) => AIProvider;

@Injectable()
export class WorkerAiCredentialsService {
  private readonly logger = new Logger(WorkerAiCredentialsService.name);
  private readonly encryptionKey: Buffer | null;
  private readonly environmentKey: string | undefined;

  constructor(
    private readonly db: WorkerDatabaseService,
    config: ConfigService,
    /** Provider built from OPENAI_API_KEY. */
    @Inject(AI_PROVIDER) private readonly environmentProvider: AIProvider,
    @Inject(AI_PROVIDER_FACTORY) private readonly providerFactory: AiProviderFactory,
  ) {
    this.encryptionKey = loadCredentialsEncryptionKey(
      config.get<string>('AI_CREDENTIALS_ENCRYPTION_KEY'),
      config.get<string>('NODE_ENV'),
    );
    this.environmentKey = config.get<string>('OPENAI_API_KEY') || undefined;
  }

  resolveOpenAIKey(organizationId: string): Promise<ResolvedApiKey | null> {
    return resolveOpenAIKey({
      organizationId,
      encryptionKey: this.encryptionKey,
      environmentKey: this.environmentKey,
      findEncryptedKey: async (orgId) =>
        (
          await this.db.organizationAiCredential.findUnique({
            where: { organizationId_provider: { organizationId: orgId, provider: 'openai' } },
            select: { encryptedKey: true },
          })
        )?.encryptedKey ?? null,
      onDecryptError: (e) =>
        this.logger.error(`Stored OpenAI key for org ${organizationId} could not be decrypted: ${e.message}`),
    });
  }

  async providerFor(organizationId: string): Promise<AIProvider | null> {
    const resolved = await this.resolveOpenAIKey(organizationId);
    if (resolved?.source === 'organization') return this.providerFactory(resolved.apiKey);
    // No org key: the server-wide provider decides whether it is usable.
    return this.environmentProvider.isAvailable() ? this.environmentProvider : null;
  }
}
