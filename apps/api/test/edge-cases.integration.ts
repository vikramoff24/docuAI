/**
 * Edge-case regression tests (input validation, authorization, races).
 *
 * Each block pins a bug found in the 2026-10-01 deep-dive: malformed input
 * that used to surface as 500s, case-sensitive emails, role escalation via
 * invitations, viewer write access, folder deletion rules, double-confirm,
 * size checks on uploads, fulltext over document bodies, and the chat
 * endpoint answering 200 before checking the conversation exists.
 *
 * Queues are mocked so a locally running worker can't pick up jobs, and the
 * server-wide AI provider is replaced with an unavailable one.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { OrganizationMemberRole, PrismaClient } from '@prisma/client';
import { encryptSecret, loadCredentialsEncryptionKey } from '@docuflow/ai';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AI_PROVIDER_TOKEN } from '../src/ai/ai.constants';
import { DOCUMENT_PROCESSING_QUEUE } from '../src/documents/documents.constants';
import { AGENT_WORKFLOWS_QUEUE } from '../src/agent/agent.service';

const runId = Date.now();
const PASSWORD = 'Password123!';

interface Session {
  token: string;
  refreshToken: string;
  orgId: string;
  userId: string;
  email: string;
}

describe('Edge cases (validation, authorization, races)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const docQueue = { add: jest.fn(), process: jest.fn(), on: jest.fn() };
  const agentQueue = { add: jest.fn(), process: jest.fn(), on: jest.fn() };
  const userEmails: string[] = [];
  const orgIds: string[] = [];

  let owner: Session;
  let admin: Session;
  let member: Session;
  let viewer: Session;

  const http = () => request(app.getHttpServer());
  const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

  async function register(label: string, email = `edge-${label}-${runId}@test.com`) {
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, firstName: 'Edge', lastName: label, organizationName: `Edge ${label}` })
      .expect(201);
    userEmails.push(res.body.data.user.email);
    orgIds.push(res.body.data.organization.id);
    return res.body.data as { user: { id: string; email: string }; organization: { id: string } };
  }

  async function login(email: string): Promise<Session> {
    const res = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
    return {
      token: res.body.data.tokens.accessToken,
      refreshToken: res.body.data.tokens.refreshToken,
      orgId: res.body.data.organization.id,
      userId: res.body.data.user.id,
      email,
    };
  }

  /** Registers a user, then moves their only membership into the owner's org with `role`. */
  async function joinOwnerOrg(label: string, role: OrganizationMemberRole): Promise<Session> {
    const reg = await register(label);
    await prisma.organizationMember.updateMany({
      where: { userId: reg.user.id },
      data: { organizationId: owner.orgId, role },
    });
    return login(reg.user.email);
  }

  async function createDocument(session: Session, name: string, extra: Record<string, unknown> = {}) {
    return prisma.document.create({
      data: {
        organizationId: session.orgId,
        createdById: session.userId,
        name,
        mimeType: 'text/plain',
        sizeBytes: 10,
        storageKey: `edge/${runId}/${name}`,
        status: 'READY',
        ...extra,
      },
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getQueueToken(DOCUMENT_PROCESSING_QUEUE))
      .useValue(docQueue)
      .overrideProvider(getQueueToken(AGENT_WORKFLOWS_QUEUE))
      .useValue(agentQueue)
      .overrideProvider(AI_PROVIDER_TOKEN)
      .useValue({ isAvailable: () => false })
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

    prisma = new PrismaClient({
      datasources: { db: { url: process.env['DATABASE_TEST_URL'] ?? process.env['DATABASE_URL'] } },
    });

    const reg = await register('owner');
    owner = await login(reg.user.email);
    admin = await joinOwnerOrg('admin', 'ADMIN');
    member = await joinOwnerOrg('member', 'MEMBER');
    viewer = await joinOwnerOrg('viewer', 'VIEWER');
  });

  afterAll(async () => {
    // Organization delete cascades to documents, folders, chunks, invitations…
    await prisma.document.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.folder.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.invitation.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.user.deleteMany({ where: { email: { in: userEmails } } });
    await prisma.$disconnect();
    await app.close();
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  describe('auth', () => {
    it('normalizes email case: mixed-case signup, lowercase login, no duplicate account', async () => {
      const mixed = `Edge-Case-${runId}@Example.COM`;
      const reg = await register('mixedcase', mixed);
      expect(reg.user.email).toBe(mixed.toLowerCase());

      await http()
        .post('/api/v1/auth/login')
        .send({ email: `  ${mixed.toLowerCase()}  `, password: PASSWORD })
        .expect(200);

      await http()
        .post('/api/v1/auth/register')
        .send({ email: mixed.toUpperCase(), password: PASSWORD, firstName: 'A', lastName: 'B', organizationName: 'Dup' })
        .expect(409);
    });

    it('rejects whitespace-only names at signup', async () => {
      await http()
        .post('/api/v1/auth/register')
        .send({ email: `blank-${runId}@test.com`, password: PASSWORD, firstName: '   ', lastName: 'B', organizationName: '  ' })
        .expect(422);
    });

    it.each([
      ['missing', {}],
      ['a number', { refreshToken: 5 }],
      ['an array', { refreshToken: ['a.b'] }],
    ])('returns 422 (not 500) when the refresh token is %s', async (_label, body) => {
      await http().post('/api/v1/auth/refresh').send(body).expect(422);
    });

    it('lets exactly one of two concurrent refreshes with the same token win', async () => {
      const session = await login(owner.email);
      const [a, b] = await Promise.all([
        http().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }),
        http().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 401]);
    });
  });

  // ── Malformed ids / query params ───────────────────────────────────────────

  describe('malformed input never 500s', () => {
    it.each([
      ['GET', '/api/v1/documents?folderId=not-a-uuid'],
      ['GET', '/api/v1/folders?parentId=not-a-uuid'],
      ['DELETE', '/api/v1/folders/not-a-uuid'],
      ['DELETE', '/api/v1/organizations/current/invitations/not-a-uuid'],
      ['GET', '/api/v1/documents/not-a-uuid'],
      ['GET', '/api/v1/search?q=' + 'x'.repeat(501)],
    ])('%s %.60s → 4xx', async (method, url) => {
      const res = await http()[method === 'GET' ? 'get' : 'delete'](url).set(auth(owner));
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('returns no suggestions (not 500) when q is repeated', async () => {
      const res = await http().get('/api/v1/search/suggest?q=ab&q=cd').set(auth(owner)).expect(200);
      expect(res.body.data.suggestions).toEqual([]);
    });

    it('treats LIKE wildcards in suggest queries literally', async () => {
      await createDocument(owner, `edge-literal-${runId}.txt`);
      const res = await http().get('/api/v1/search/suggest?q=%25%25').set(auth(owner)).expect(200);
      expect(res.body.data.suggestions).toEqual([]);
    });

    it('returns 422 for an invitation accept without a token', async () => {
      await http().post('/api/v1/invitations/accept').set(auth(owner)).send({}).expect(422);
    });
  });

  // ── Search ─────────────────────────────────────────────────────────────────

  describe('search', () => {
    it('finds documents by their extracted text, not just the name', async () => {
      const doc = await createDocument(owner, `quarterly-${runId}.txt`);
      await prisma.documentChunk.create({
        data: {
          documentId: doc.id,
          organizationId: owner.orgId,
          content: 'The zanzibarite reconciliation process closes every quarter.',
          chunkIndex: 0,
          tokenCount: 12,
        },
      });

      const res = await http()
        .get('/api/v1/search?q=zanzibarite&mode=fulltext')
        .set(auth(owner))
        .expect(200);
      expect(res.body.data.results.map((r: { id: string }) => r.id)).toContain(doc.id);
      expect(res.body.data.results[0].highlights[0]).toContain('<mark>');
    });

    it('treats a hostile mimeType filter as data (fulltext)', async () => {
      const injection = encodeURIComponent("text/' OR 1=1 --");
      const res = await http()
        .get(`/api/v1/search?q=zanzibarite&mode=fulltext&mimeType=${injection}`)
        .set(auth(owner))
        .expect(200);
      expect(res.body.data.results).toEqual([]);
    });

    it('treats hostile filters as data on the semantic (vector) path', async () => {
      // An org key makes semantic search run its own SQL instead of falling back
      const reg = await register('semantic');
      const searcher = await login(reg.user.email);
      const encryptionKey = loadCredentialsEncryptionKey(
        process.env['AI_CREDENTIALS_ENCRYPTION_KEY'],
        process.env['NODE_ENV'],
      )!;
      await prisma.organizationAiCredential.create({
        data: {
          organizationId: searcher.orgId,
          provider: 'openai',
          encryptedKey: encryptSecret('sk-test-edge-cases-0000', encryptionKey, searcher.orgId),
          keyLast4: '0000',
        },
      });
      const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
      const doc = await createDocument(searcher, `vector-${runId}.txt`, { mimeType: 'text/plain' });
      await prisma.documentChunk.create({
        data: { documentId: doc.id, organizationId: searcher.orgId, content: 'vector body', chunkIndex: 0, tokenCount: 2 },
      });
      await prisma.$executeRaw`
        UPDATE "document_chunks" SET "embedding" = ${`[${vector.join(',')}]`}::vector
        WHERE "documentId" = ${doc.id}::uuid`;

      const realFetch = global.fetch;
      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) =>
        String(input).includes('api.openai.com/v1/embeddings')
          ? new Response(JSON.stringify({ data: [{ embedding: vector, index: 0 }] }), { status: 200 })
          : realFetch(input, init),
      );
      try {
        const ok = await http().get('/api/v1/search?q=anything&mode=semantic').set(auth(searcher)).expect(200);
        expect(ok.body.data.results.map((r: { id: string }) => r.id)).toEqual([doc.id]);

        const filtered = await http()
          .get('/api/v1/search?q=anything&mode=semantic&mimeType=text%2F')
          .set(auth(searcher))
          .expect(200);
        expect(filtered.body.data.results).toHaveLength(1);

        for (const mimeType of ["text/' OR 1=1 --", "x%' OR '1'='1", '%']) {
          const res = await http()
            .get(`/api/v1/search?q=anything&mode=semantic&mimeType=${encodeURIComponent(mimeType)}`)
            .set(auth(searcher))
            .expect(200);
          expect(res.body.data.results).toEqual([]);
        }

        const tagged = await http()
          .get(`/api/v1/search?q=anything&mode=semantic&tags=${encodeURIComponent("a'],ARRAY['b")}`)
          .set(auth(searcher))
          .expect(200);
        expect(tagged.body.data.results).toEqual([]);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  // ── Roles ──────────────────────────────────────────────────────────────────

  describe('roles', () => {
    const upload = { name: 'notes.txt', mimeType: 'text/plain', sizeBytes: 10 };

    it('forbids VIEWERs from uploading, deleting and creating folders', async () => {
      await http().post('/api/v1/documents/upload-url').set(auth(viewer)).send(upload).expect(403);
      await http().post('/api/v1/folders').set(auth(viewer)).send({ name: `v-${runId}` }).expect(403);
      const doc = await createDocument(owner, `viewer-target-${runId}.txt`);
      await http().delete(`/api/v1/documents/${doc.id}`).set(auth(viewer)).expect(403);
    });

    it('lets a MEMBER delete only their own documents', async () => {
      const own = await createDocument(member, `member-own-${runId}.txt`, { organizationId: owner.orgId });
      const others = await createDocument(owner, `owner-doc-${runId}.txt`);
      await http().delete(`/api/v1/documents/${others.id}`).set(auth(member)).expect(403);
      await http().delete(`/api/v1/documents/${own.id}`).set(auth(member)).expect(204);
    });

    it("lets an ADMIN delete another member's document", async () => {
      const doc = await createDocument(member, `member-doc-${runId}.txt`, { organizationId: owner.orgId });
      await http().delete(`/api/v1/documents/${doc.id}`).set(auth(admin)).expect(204);
    });

    it('stops an ADMIN from inviting an OWNER (role escalation)', async () => {
      await http()
        .post('/api/v1/organizations/current/invitations')
        .set(auth(admin))
        .send({ email: `escalate-${runId}@test.com`, role: 'OWNER' })
        .expect(403);
      await http()
        .post('/api/v1/organizations/current/invitations')
        .set(auth(admin))
        .send({ email: `new-admin-${runId}@test.com`, role: 'ADMIN' })
        .expect(201);
    });

    it('treats invitation emails case-insensitively', async () => {
      await http()
        .post('/api/v1/organizations/current/invitations')
        .set(auth(owner))
        .send({ email: member.email.toUpperCase() })
        .expect(409); // already a member
    });
  });

  // ── Folders ────────────────────────────────────────────────────────────────

  describe('folders', () => {
    it.each([['a/b'], ['   '], ['back\\slash']])('rejects the folder name %p', async (name) => {
      await http().post('/api/v1/folders').set(auth(owner)).send({ name }).expect(422);
    });

    it('trims folder names', async () => {
      const res = await http().post('/api/v1/folders').set(auth(owner)).send({ name: `  Trim ${runId}  ` }).expect(201);
      expect(res.body.data.name).toBe(`Trim ${runId}`);
    });

    it('deletes a user-created top-level folder, but never the root', async () => {
      const top = await http().post('/api/v1/folders').set(auth(owner)).send({ name: `Top ${runId}` }).expect(201);
      expect(top.body.data.parentId).toBeNull();
      await http().delete(`/api/v1/folders/${top.body.data.id}`).set(auth(owner)).expect(204);

      const root = await prisma.folder.findFirstOrThrow({ where: { organizationId: owner.orgId, path: '/' } });
      await http().delete(`/api/v1/folders/${root.id}`).set(auth(owner)).expect(409);
    });

    it('ignores soft-deleted documents when checking that a folder is empty', async () => {
      const folder = await http().post('/api/v1/folders').set(auth(owner)).send({ name: `Emptied ${runId}` }).expect(201);
      await createDocument(owner, `deleted-in-folder-${runId}.txt`, {
        folderId: folder.body.data.id,
        deletedAt: new Date(),
      });
      await http().delete(`/api/v1/folders/${folder.body.data.id}`).set(auth(owner)).expect(204);
    });
  });

  // ── Upload confirm ─────────────────────────────────────────────────────────

  describe('upload confirm', () => {
    async function startUpload(body: Buffer, declaredSize: number) {
      const res = await http()
        .post('/api/v1/documents/upload-url')
        .set(auth(owner))
        .send({ name: `  upload-${runId}.txt  `, mimeType: 'text/plain', sizeBytes: declaredSize })
        .expect(201);
      const put = await fetch(res.body.data.uploadUrl, {
        method: 'PUT',
        body: new Uint8Array(body),
        headers: { 'Content-Type': 'text/plain' },
      });
      expect(put.ok).toBe(true);
      return res.body.data.documentId as string;
    }

    it('queues a document once even if confirm is sent twice concurrently', async () => {
      const content = Buffer.from('hello edge cases');
      const id = await startUpload(content, content.length);
      docQueue.add.mockClear();

      const [a, b] = await Promise.all([
        http().post(`/api/v1/documents/${id}/confirm`).set(auth(owner)),
        http().post(`/api/v1/documents/${id}/confirm`).set(auth(owner)),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 400]);
      expect(docQueue.add).toHaveBeenCalledTimes(1);

      const doc = await prisma.document.findUniqueOrThrow({ where: { id } });
      expect(doc.name).toBe(`upload-${runId}.txt`); // trimmed
    });

    it('records the real stored size, not the declared one', async () => {
      const content = Buffer.from('twenty-one bytes long');
      const id = await startUpload(content, 5);
      await http().post(`/api/v1/documents/${id}/confirm`).set(auth(owner)).expect(200);
      const doc = await prisma.document.findUniqueOrThrow({ where: { id } });
      expect(doc.sizeBytes).toBe(content.length);
    });

    it('rejects an empty upload and discards the record', async () => {
      const id = await startUpload(Buffer.alloc(0), 10);
      const res = await http().post(`/api/v1/documents/${id}/confirm`).set(auth(owner)).expect(400);
      expect(res.body.message).toMatch(/empty/i);
      const doc = await prisma.document.findUniqueOrThrow({ where: { id } });
      expect(doc.deletedAt).not.toBeNull();
    });

    it('caps tags', async () => {
      await http()
        .post('/api/v1/documents/upload-url')
        .set(auth(owner))
        .send({ name: 'tags.txt', mimeType: 'text/plain', sizeBytes: 1, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) })
        .expect(422);
    });
  });

  // ── AI endpoints without a key ─────────────────────────────────────────────

  describe('AI endpoints', () => {
    it('answers a chat message with a real 503 (not a 200 stream) when AI is not configured', async () => {
      const conv = await http().post('/api/v1/conversations').set(auth(owner)).send({ title: 'x' }).expect(201);
      const res = await http()
        .post(`/api/v1/conversations/${conv.body.data.id}/messages`)
        .set(auth(owner))
        .send({ content: 'hello' })
        .expect(503);
      expect(res.body.message).toMatch(/not configured/i);

      // Nothing was persisted for the failed turn
      const messages = await prisma.message.count({ where: { conversationId: conv.body.data.id } });
      expect(messages).toBe(0);
    });

    it('checks summarize requests in order: not found → not ready → AI not configured', async () => {
      const ready = await createDocument(owner, `sum-ready-${runId}.txt`);
      const processing = await createDocument(owner, `sum-proc-${runId}.txt`, { status: 'PROCESSING' });
      const failed = await createDocument(owner, `sum-failed-${runId}.txt`, { status: 'FAILED' });
      const outsider = await login((await register('sum-outsider')).user.email);

      // Another org's document is simply not found — even though that org has no AI key either
      await http().post(`/api/v1/ai/documents/${ready.id}/summarize`).set(auth(outsider)).expect(404);
      const proc = await http().post(`/api/v1/ai/documents/${processing.id}/summarize`).set(auth(owner)).expect(409);
      expect(proc.body.message).toMatch(/still being processed/i);
      const fail = await http().post(`/api/v1/ai/documents/${failed.id}/summarize`).set(auth(owner)).expect(409);
      expect(fail.body.message).toMatch(/could not be processed/i);
      await http().post(`/api/v1/ai/documents/${ready.id}/summarize`).set(auth(owner)).expect(503);
    });

    it('returns 404 (not 200) for a message to an unknown conversation', async () => {
      await http()
        .post('/api/v1/conversations/00000000-0000-4000-8000-000000000000/messages')
        .set(auth(owner))
        .send({ content: 'hello' })
        .expect(404);
    });

    it('rejects whitespace-only chat messages and workflow instructions', async () => {
      const conv = await http().post('/api/v1/conversations').set(auth(owner)).send({}).expect(201);
      await http()
        .post(`/api/v1/conversations/${conv.body.data.id}/messages`)
        .set(auth(owner))
        .send({ content: '   ' })
        .expect(422);
      await http()
        .post('/api/v1/workflows')
        .set(auth(owner))
        .send({ type: 'general', instructions: '   \n  ' })
        .expect(422);
    });

    it('marks a workflow FAILED (not stuck PENDING) when it cannot be queued', async () => {
      agentQueue.add.mockRejectedValueOnce(new Error('redis down'));
      await http()
        .post('/api/v1/workflows')
        .set(auth(owner))
        .send({ type: 'general', instructions: 'tidy up' })
        .expect(503);
      const latest = await prisma.workflow.findFirstOrThrow({
        where: { organizationId: owner.orgId },
        orderBy: { createdAt: 'desc' },
      });
      expect(latest.status).toBe('FAILED');
    });
  });
});
