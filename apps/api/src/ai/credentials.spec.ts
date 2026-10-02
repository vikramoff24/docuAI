/**
 * Unit tests for @docuflow/ai organization-credential helpers
 * (encryption at rest + key resolution order).
 */

import { randomBytes } from 'node:crypto';
import {
  decryptSecret,
  encryptSecret,
  keyHint,
  loadCredentialsEncryptionKey,
  OPENAI_KEY_PATTERN,
  resolveOpenAIKey,
} from '@docuflow/ai';

const KEY = randomBytes(32);
const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const SECRET = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';

describe('credentials encryption', () => {
  it('round-trips and never contains the plaintext', () => {
    const payload = encryptSecret(SECRET, KEY, ORG_A);
    expect(payload.startsWith('v1:')).toBe(true);
    expect(payload).not.toContain(SECRET);
    expect(decryptSecret(payload, KEY, ORG_A)).toBe(SECRET);
  });

  it('uses a fresh IV per encryption', () => {
    expect(encryptSecret(SECRET, KEY, ORG_A)).not.toBe(encryptSecret(SECRET, KEY, ORG_A));
  });

  it("rejects a ciphertext moved to another organization (AAD)", () => {
    const payload = encryptSecret(SECRET, KEY, ORG_A);
    expect(() => decryptSecret(payload, KEY, ORG_B)).toThrow();
  });

  it('rejects tampering and the wrong key', () => {
    const payload = encryptSecret(SECRET, KEY, ORG_A);
    const [v, iv, tag, ct] = payload.split(':');
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 0xff;
    expect(() => decryptSecret([v, iv, tag, flipped.toString('base64')].join(':'), KEY, ORG_A)).toThrow();
    expect(() => decryptSecret(payload, randomBytes(32), ORG_A)).toThrow();
    expect(() => decryptSecret('garbage', KEY, ORG_A)).toThrow(/format/);
  });
});

describe('loadCredentialsEncryptionKey', () => {
  it('accepts base64 and hex 32-byte keys', () => {
    expect(loadCredentialsEncryptionKey(KEY.toString('base64'), 'production')).toEqual(KEY);
    expect(loadCredentialsEncryptionKey(KEY.toString('hex'), 'production')).toEqual(KEY);
  });

  it('rejects keys of the wrong length', () => {
    expect(() => loadCredentialsEncryptionKey(randomBytes(16).toString('base64'), 'development')).toThrow(
      /32 bytes/,
    );
  });

  it('falls back to a dev key outside production, and to null in production', () => {
    expect(loadCredentialsEncryptionKey(undefined, 'development')).toHaveLength(32);
    expect(loadCredentialsEncryptionKey(undefined, 'production')).toBeNull();
  });
});

describe('resolveOpenAIKey', () => {
  const stored = encryptSecret(SECRET, KEY, ORG_A);

  it('prefers the organization key over the environment key', async () => {
    await expect(
      resolveOpenAIKey({
        organizationId: ORG_A,
        findEncryptedKey: async () => stored,
        encryptionKey: KEY,
        environmentKey: 'sk-env',
      }),
    ).resolves.toEqual({ apiKey: SECRET, source: 'organization' });
  });

  it('falls back to the environment key, then to null', async () => {
    const base = { organizationId: ORG_A, findEncryptedKey: async () => null, encryptionKey: KEY };
    await expect(resolveOpenAIKey({ ...base, environmentKey: 'sk-env' })).resolves.toEqual({
      apiKey: 'sk-env',
      source: 'environment',
    });
    await expect(resolveOpenAIKey({ ...base, environmentKey: undefined })).resolves.toBeNull();
  });

  it('skips an undecryptable stored key and reports it', async () => {
    const onDecryptError = jest.fn();
    await expect(
      resolveOpenAIKey({
        organizationId: ORG_B, // wrong AAD
        findEncryptedKey: async () => stored,
        encryptionKey: KEY,
        environmentKey: 'sk-env',
        onDecryptError,
      }),
    ).resolves.toEqual({ apiKey: 'sk-env', source: 'environment' });
    expect(onDecryptError).toHaveBeenCalledTimes(1);
  });
});

describe('key helpers', () => {
  it('validates OpenAI key shape and exposes only the last 4 characters', () => {
    expect(OPENAI_KEY_PATTERN.test(SECRET)).toBe(true);
    expect(OPENAI_KEY_PATTERN.test('sk-short')).toBe(false);
    expect(OPENAI_KEY_PATTERN.test('pk-abcdefghijklmnopqrstuvwxyz')).toBe(false);
    expect(keyHint(SECRET)).toBe('6789');
  });
});
