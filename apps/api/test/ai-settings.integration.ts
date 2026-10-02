/**
 * AI Settings — integration tests
 *
 * Organization OpenAI keys set from the UI:
 *   GET/PUT/DELETE /api/v1/settings/ai[/openai-key]
 * plus proof that AI features actually use the stored key.
 *
 * OpenAI is never called: the key verifier and provider factory are replaced.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import {
  decryptSecret,
  loadCredentialsEncryptionKey,
  type AIProvider,
  type CompletionResult,
  type StreamChunk,
} from '@docuflow/ai';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { DatabaseService } from '../src/database/database.service';
import { AI_PROVIDER_FACTORY_TOKEN, OPENAI_KEY_VERIFIER_TOKEN } from '../src/ai/ai.constants';
import type { OpenAIKeyVerifier } from '../src/ai/ai-credentials.service';

const PASSWORD = 'Password123!';
const VALID_KEY = 'sk-proj-validvalidvalidvalidvalid1234';
const REPLACEMENT_KEY = 'sk-proj-replacementreplacement9876';

/** Provider the factory hands out for org keys; records the key it was built with. */
class OrgKeyProvider implements AIProvider {
  name = 'org-key-mock';
  defaultModel = 'mock';
  embeddingModel = 'mock';
  constructor(readonly apiKey: string) {}
  isAvailable = () => true;
  async embed() {
    return [];
  }
  async *stream(): AsyncGenerator<StreamChunk> {}
  async complete(): Promise<CompletionResult> {
    return {
      content: JSON.stringify({ summary: `summarized with …${this.apiKey.slice(-4)}`, keyPoints: ['a'] }),
      finishReason: 'stop',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'mock',
    };
  }
}

describe('AI Settings Integration', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  const runId = Date.now();
  const orgIds: string[] = [];
  const builtProviders: OrgKeyProvider[] = [];

  // "invalid" → OpenAI says 401; "offline" → network failure
  const verifier: jest.MockedFunction<OpenAIKeyVerifier> = jest.fn(async (key: string) =>
    key.includes('invalid') ? 'invalid' : key.includes('offline') ? 'unreachable' : 'valid',
  );

  interface Session {
    token: string;
    orgId: string;
    userId: string;
    email: string;
  }
  let owner: Session;
  let other: Session;

  const server = () => app.getHttpServer();

  async function registerAndLogin(label: string): Promise<Session> {
    const email = `ai-settings-${label}-${runId}@test.com`;
    const reg = await request(server())
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, firstName: 'Set', lastName: label, organizationName: `Settings ${label}` })
      .expect(201);
    const login = await request(server()).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
    orgIds.push(reg.body.data.organization.id);
    return {
      token: login.body.data.tokens.accessToken,
      orgId: reg.body.data.organization.id,
      userId: reg.body.data.user.id,
      email,
    };
  }

  /**
   * A token for a different user who belongs to `session`'s organization with
   * `role`. (Roles are read live from the membership on every request, so a
   * token can't simply carry a stale role.)
   */
  async function tokenWithRole(session: Session, role: 'MEMBER' | 'VIEWER') {
    const user = await registerAndLogin(`${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`);
    await db.organizationMember.update({
      where: { userId_organizationId: { userId: user.userId, organizationId: user.orgId } },
      data: { organizationId: session.orgId, role },
    });
    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    return login.body.data.tokens.accessToken as string;
  }

  const putKey = (token: string, apiKey: unknown) =>
    request(server()).put('/api/v1/settings/ai/openai-key').set('Authorization', `Bearer ${token}`).send({ apiKey });
  const getStatus = (token: string) =>
    request(server()).get('/api/v1/settings/ai').set('Authorization', `Bearer ${token}`).expect(200);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OPENAI_KEY_VERIFIER_TOKEN)
      .useValue(verifier)
      .overrideProvider(AI_PROVIDER_FACTORY_TOKEN)
      .useValue((apiKey: string) => {
        const p = new OrgKeyProvider(apiKey);
        builtProviders.push(p);
        return p;
      })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validateCustomDecorators: true,
        errorHttpStatusCode: 422,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = moduleFixture.get(DatabaseService);
    owner = await registerAndLogin('owner');
    other = await registerAndLogin('other');
  });

  afterAll(async () => {
    await db.organization.deleteMany({ where: { id: { in: orgIds } } });
    await db.user.deleteMany({ where: { email: { contains: `-${runId}@test.com` } } });
    await app.close();
  });

  it('reports "not configured" for a new organization', async () => {
    const res = await getStatus(owner.token);
    expect(res.body.data).toMatchObject({ configured: false, source: null, last4: null, canStoreKeys: true });
  });

  it('requires authentication', async () => {
    await request(server()).get('/api/v1/settings/ai').expect(401);
    await request(server()).put('/api/v1/settings/ai/openai-key').send({ apiKey: VALID_KEY }).expect(401);
  });

  it('rejects keys that are not OpenAI-shaped without calling OpenAI', async () => {
    verifier.mockClear();
    for (const bad of ['hello', 'pk-abcdefghijklmnopqrstuvwxyz', 'sk-short', 42]) {
      await putKey(owner.token, bad).expect(422);
    }
    expect(verifier).not.toHaveBeenCalled();
  });

  it('forbids MEMBERs and VIEWERs from setting or removing the key, but lets them read status', async () => {
    for (const role of ['MEMBER', 'VIEWER'] as const) {
      const token = await tokenWithRole(owner, role);
      await putKey(token, VALID_KEY).expect(403);
      await request(server()).delete('/api/v1/settings/ai/openai-key').set('Authorization', `Bearer ${token}`).expect(403);
      await getStatus(token);
    }
  });

  it('returns 422 when OpenAI rejects the key and 502 when OpenAI is unreachable', async () => {
    const rejected = await putKey(owner.token, 'sk-invalidinvalidinvalidinvalid').expect(422);
    expect(rejected.body.message).toMatch(/rejected/i);
    const offline = await putKey(owner.token, 'sk-offlineofflineofflineoffline').expect(502);
    expect(offline.body.message).toMatch(/couldn't reach openai/i);
    expect(await db.organizationAiCredential.count({ where: { organizationId: owner.orgId } })).toBe(0);
  });

  it('stores a verified key encrypted and only ever returns its last 4 characters', async () => {
    const res = await putKey(owner.token, VALID_KEY).expect(200);

    expect(res.body.data).toMatchObject({
      configured: true,
      source: 'organization',
      last4: '1234',
      updatedBy: { firstName: 'Set', lastName: 'owner' },
    });
    expect(JSON.stringify(res.body)).not.toContain(VALID_KEY);
    expect(JSON.stringify((await getStatus(owner.token)).body)).not.toContain(VALID_KEY);

    const row = await db.organizationAiCredential.findFirstOrThrow({ where: { organizationId: owner.orgId } });
    expect(row.encryptedKey).not.toContain(VALID_KEY);
    const key = loadCredentialsEncryptionKey(process.env['AI_CREDENTIALS_ENCRYPTION_KEY'], process.env['NODE_ENV'])!;
    expect(decryptSecret(row.encryptedKey, key, owner.orgId)).toBe(VALID_KEY);
    expect(() => decryptSecret(row.encryptedKey, key, other.orgId)).toThrow();

    const audit = await db.auditLog.findFirstOrThrow({
      where: { organizationId: owner.orgId, action: 'ORG_UPDATED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.metadata).toMatchObject({ setting: 'ai.openai_api_key', change: 'set', last4: '1234' });
    expect(JSON.stringify(audit.metadata)).not.toContain(VALID_KEY);
  });

  it("does not leak into other organizations", async () => {
    const res = await getStatus(other.token);
    expect(res.body.data).toMatchObject({ configured: false, last4: null });
  });

  it('uses the stored key for AI features (document summary)', async () => {
    const doc = await db.document.create({
      data: {
        organizationId: owner.orgId,
        createdById: owner.userId,
        name: `summary-${runId}.txt`,
        mimeType: 'text/plain',
        sizeBytes: 10,
        storageKey: `docs/${owner.orgId}/summary-${runId}.txt`,
        status: 'READY',
        chunks: {
          create: { organizationId: owner.orgId, content: 'Quarterly revenue grew.', chunkIndex: 0, tokenCount: 5 },
        },
      },
    });

    builtProviders.length = 0;
    const res = await request(server())
      .post(`/api/v1/ai/documents/${doc.id}/summarize`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(res.body.data.summary).toBe('summarized with …1234');
    expect(builtProviders.map((p) => p.apiKey)).toContain(VALID_KEY);
  });

  it('returns 503 with guidance when neither the org nor the server has a key', async () => {
    const doc = await db.document.create({
      data: {
        organizationId: other.orgId,
        createdById: other.userId,
        name: `nokey-${runId}.txt`,
        mimeType: 'text/plain',
        sizeBytes: 10,
        storageKey: `docs/${other.orgId}/nokey-${runId}.txt`,
        status: 'READY',
      },
    });
    const res = await request(server())
      .post(`/api/v1/ai/documents/${doc.id}/summarize`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(503);
    expect(res.body.message).toMatch(/add an OpenAI API key in Settings/);
  });

  it('replaces an existing key instead of adding a second one', async () => {
    const res = await putKey(owner.token, REPLACEMENT_KEY).expect(200);
    expect(res.body.data.last4).toBe('9876');
    expect(await db.organizationAiCredential.count({ where: { organizationId: owner.orgId } })).toBe(1);
  });

  it('removes the key (idempotently) and audits the removal', async () => {
    const del = () =>
      request(server()).delete('/api/v1/settings/ai/openai-key').set('Authorization', `Bearer ${owner.token}`);
    await del().expect(204);
    await del().expect(204);

    const res = await getStatus(owner.token);
    expect(res.body.data).toMatchObject({ configured: false, last4: null });
    expect(
      await db.auditLog.count({
        where: { organizationId: owner.orgId, action: 'ORG_UPDATED', metadata: { path: ['change'], equals: 'removed' } },
      }),
    ).toBe(1);
  });
});
