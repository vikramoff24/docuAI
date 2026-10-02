/**
 * Organization AI credentials — encryption at rest + key resolution.
 *
 * Organizations can store their own OpenAI API key (set in the UI). It is
 * encrypted with AES-256-GCM using a server-side key (AI_CREDENTIALS_ENCRYPTION_KEY)
 * and the organization id as additional authenticated data, so a ciphertext
 * copied into another organization's row fails to decrypt.
 *
 * Shared by the API (writes + reads) and the worker (reads).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;

/** Development-only fallback so a fresh checkout works; production must set the env var. */
const DEV_FALLBACK_SEED = 'docuflow-dev-only-ai-credentials-key';

export type ApiKeySource = 'organization' | 'environment';

export interface ResolvedApiKey {
  apiKey: string;
  source: ApiKeySource;
}

/**
 * Loads the 32-byte encryption key from `AI_CREDENTIALS_ENCRYPTION_KEY`
 * (base64 or 64-char hex). Returns null in production when unset, so callers
 * can refuse to store keys rather than use a guessable key.
 */
export function loadCredentialsEncryptionKey(
  raw: string | undefined,
  nodeEnv: string | undefined,
): Buffer | null {
  if (raw) {
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error('AI_CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes (base64 or hex)');
    }
    return key;
  }
  if (nodeEnv === 'production') return null;
  return createHash('sha256').update(DEV_FALLBACK_SEED).digest();
}

/** Encrypts a secret. Output: `v1:<iv>:<authTag>:<ciphertext>` (base64 parts). */
export function encryptSecret(plaintext: string, key: Buffer, associatedData: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Decrypts a value from `encryptSecret`. Throws if tampered, wrong key, or wrong associated data. */
export function decryptSecret(payload: string, key: Buffer, associatedData: string): string {
  const [version, iv, tag, ciphertext] = payload.split(':');
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error('Unrecognized encrypted secret format');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

/** Basic shape check for OpenAI secret keys (`sk-...`, `sk-proj-...`). */
export const OPENAI_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{20,200}$/;

/** Last four characters, the only part of a key ever shown back to users. */
export function keyHint(apiKey: string): string {
  return apiKey.slice(-4);
}

/**
 * Picks the OpenAI key for an organization: its own stored key first, then the
 * server-wide OPENAI_API_KEY. A stored key that can't be decrypted (e.g. the
 * encryption key was rotated) is reported via `onDecryptError` and skipped.
 */
export async function resolveOpenAIKey(params: {
  organizationId: string;
  findEncryptedKey: (organizationId: string) => Promise<string | null>;
  encryptionKey: Buffer | null;
  environmentKey: string | undefined;
  onDecryptError?: (error: Error) => void;
}): Promise<ResolvedApiKey | null> {
  const { organizationId, findEncryptedKey, encryptionKey, environmentKey, onDecryptError } = params;

  if (encryptionKey) {
    const encrypted = await findEncryptedKey(organizationId);
    if (encrypted) {
      try {
        return { apiKey: decryptSecret(encrypted, encryptionKey, organizationId), source: 'organization' };
      } catch (e) {
        onDecryptError?.(e as Error);
      }
    }
  }

  return environmentKey ? { apiKey: environmentKey, source: 'environment' } : null;
}
