/**
 * Team & workspace integration tests (2026-10-01):
 * organization switching, invitations end to end (shareable link, preview,
 * sign-up through a link), member management rules, live membership/role
 * checks on every request, folders + moving documents, reprocess and reindex.
 *
 * Queues are mocked so a locally running worker can't pick up jobs. The
 * server-wide AI provider's availability is toggled per test.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { OrganizationMemberRole, PrismaClient } from '@prisma/client';

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

describe('Team & workspace', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const docQueue = { add: jest.fn(), process: jest.fn(), on: jest.fn() };
  const agentQueue = { add: jest.fn(), process: jest.fn(), on: jest.fn() };
  let aiAvailable = false;
  const orgIds: string[] = [];
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const auth = (s: Session | string) => ({ Authorization: `Bearer ${typeof s === 'string' ? s : s.token}` });
  const email = (label: string) => `team-${label}-${seq++}-${runId}@test.com`;

  async function register(label: string, address = email(label)) {
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email: address, password: PASSWORD, firstName: 'Team', lastName: label, organizationName: `Team ${label}` })
      .expect(201);
    orgIds.push(res.body.data.organization.id);
    return address;
  }

  async function login(address: string): Promise<Session> {
    const res = await http().post('/api/v1/auth/login').send({ email: address, password: PASSWORD }).expect(200);
    return {
      token: res.body.data.tokens.accessToken,
      refreshToken: res.body.data.tokens.refreshToken,
      orgId: res.body.data.organization.id,
      userId: res.body.data.user.id,
      email: address,
    };
  }

  /** Invites `address` to `inviter`'s org and returns the invitation token. */
  async function invite(inviter: Session, address: string, role: OrganizationMemberRole = 'MEMBER') {
    const res = await http()
      .post('/api/v1/organizations/current/invitations')
      .set(auth(inviter))
      .send({ email: address, role })
      .expect(201);
    expect(res.body.data.invitationToken).toEqual(expect.any(String));
    return res.body.data.invitationToken as string;
  }

  /** A user whose only membership is `owner`'s org with `role`. */
  async function teammate(owner: Session, label: string, role: OrganizationMemberRole): Promise<Session> {
    const address = email(label);
    const token = await invite(owner, address, role);
    await http()
      .post('/api/v1/auth/register')
      .send({ email: address, password: PASSWORD, firstName: 'Team', lastName: label, invitationToken: token })
      .expect(201);
    return login(address);
  }

  async function switchTo(session: Session, organizationId: string): Promise<Session> {
    const res = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken, organizationId })
      .expect(200);
    return { ...session, token: res.body.data.accessToken, refreshToken: res.body.data.refreshToken, orgId: organizationId };
  }

  async function createDocument(session: Session, name: string, extra: Record<string, unknown> = {}) {
    return prisma.document.create({
      data: {
        organizationId: session.orgId,
        createdById: session.userId,
        name,
        mimeType: 'text/plain',
        sizeBytes: 10,
        storageKey: `team/${runId}/${name}`,
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
      .useValue({ isAvailable: () => aiAvailable })
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
  });

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.folder.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.invitation.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.user.deleteMany({ where: { email: { contains: `-${runId}@test.com` } } });
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(() => {
    docQueue.add.mockClear();
    aiAvailable = false;
  });

  // ── Organization switching ─────────────────────────────────────────────────

  describe('organization switching', () => {
    it('switches into an org joined by invitation, and resumes there on the next login', async () => {
      const owner = await login(await register('switch-owner'));
      const guestEmail = await register('switch-guest');
      let guest = await login(guestEmail);
      const homeOrg = guest.orgId;

      await createDocument(owner, `owner-only-${runId}.txt`);
      const token = await invite(owner, guestEmail, 'VIEWER');
      await http().post('/api/v1/invitations/accept').set(auth(guest)).send({ token }).expect(200);

      const orgs = await http().get('/api/v1/auth/organizations').set(auth(guest)).expect(200);
      expect(orgs.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: homeOrg, role: 'OWNER', current: true }),
          expect.objectContaining({ id: owner.orgId, role: 'VIEWER', current: false }),
        ]),
      );

      const res = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: guest.refreshToken, organizationId: owner.orgId })
        .expect(200);
      expect(res.body.data.organization).toEqual(expect.objectContaining({ id: owner.orgId, role: 'VIEWER' }));
      guest = { ...guest, token: res.body.data.accessToken, refreshToken: res.body.data.refreshToken };

      const me = await http().get('/api/v1/auth/me').set(auth(guest)).expect(200);
      expect(me.body.data).toEqual(expect.objectContaining({ organizationId: owner.orgId, role: 'VIEWER' }));
      const docs = await http().get('/api/v1/documents').set(auth(guest)).expect(200);
      expect(docs.body.data.items.map((d: { name: string }) => d.name)).toContain(`owner-only-${runId}.txt`);

      // A plain refresh stays in the switched org; so does the next login
      const plain = await http().post('/api/v1/auth/refresh').send({ refreshToken: guest.refreshToken }).expect(200);
      expect(plain.body.data.organization.id).toBe(owner.orgId);
      const again = await login(guestEmail);
      expect(again.orgId).toBe(owner.orgId);
    });

    it('refuses to switch into an org you are not in, without burning the refresh token', async () => {
      const outsider = await login(await register('switch-outsider'));
      const other = await login(await register('switch-other'));
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: outsider.refreshToken, organizationId: other.orgId })
        .expect(403);
      // The original token still works
      await http().post('/api/v1/auth/refresh').send({ refreshToken: outsider.refreshToken }).expect(200);
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'x', organizationId: 'not-a-uuid' })
        .expect(422);
    });
  });

  // ── Live membership / role checks ──────────────────────────────────────────

  describe('membership is checked on every request', () => {
    it('applies a role change immediately, even to an already-issued token', async () => {
      const owner = await login(await register('live-owner'));
      const admin = await teammate(owner, 'live-admin', 'ADMIN');
      await http().post('/api/v1/folders').set(auth(admin)).send({ name: `before-${runId}` }).expect(201);

      await http()
        .patch(`/api/v1/organizations/current/members/${admin.userId}`)
        .set(auth(owner))
        .send({ role: 'VIEWER' })
        .expect(200);
      // Same token, new role
      await http().post('/api/v1/folders').set(auth(admin)).send({ name: `after-${runId}` }).expect(403);
    });

    it('locks a removed member out at once and moves their session to another org', async () => {
      const owner = await login(await register('rm-owner'));
      const guestEmail = await register('rm-guest');
      let guest = await login(guestEmail);
      const homeOrg = guest.orgId;
      const token = await invite(owner, guestEmail, 'MEMBER');
      await http().post('/api/v1/invitations/accept').set(auth(guest)).send({ token }).expect(200);
      guest = await switchTo(guest, owner.orgId);
      await http().get('/api/v1/documents').set(auth(guest)).expect(200);

      await http().delete(`/api/v1/organizations/current/members/${guest.userId}`).set(auth(owner)).expect(204);

      const denied = await http().get('/api/v1/documents').set(auth(guest)).expect(401);
      expect(denied.body.message).toMatch(/no longer a member/i);
      const refreshed = await http().post('/api/v1/auth/refresh').send({ refreshToken: guest.refreshToken }).expect(200);
      expect(refreshed.body.data.organization.id).toBe(homeOrg);
    });
  });

  it('gives a user removed from their only organization a fresh workspace on next login', async () => {
    const owner = await login(await register('orphan-owner'));
    const guest = await teammate(owner, 'orphan-guest', 'MEMBER');
    await http().delete(`/api/v1/organizations/current/members/${guest.userId}`).set(auth(owner)).expect(204);

    // Their refresh token has nowhere to go → session over
    await http().post('/api/v1/auth/refresh').send({ refreshToken: guest.refreshToken }).expect(401);
    const res = await http().post('/api/v1/auth/login').send({ email: guest.email, password: PASSWORD }).expect(200);
    expect(res.body.data.organization).toEqual(
      expect.objectContaining({ name: "Team's workspace", role: 'OWNER' }),
    );
    orgIds.push(res.body.data.organization.id);
    expect(res.body.data.organization.id).not.toBe(owner.orgId);
  });

  // ── Invitations ────────────────────────────────────────────────────────────

  describe('invitations', () => {
    it('previews an invitation publicly, and 404s for unknown tokens', async () => {
      const owner = await login(await register('preview-owner'));
      const newcomer = email('preview-new');
      const token = await invite(owner, newcomer, 'MEMBER');

      const res = await http().get(`/api/v1/invitations/preview?token=${token}`).expect(200);
      expect(res.body.data).toEqual(
        expect.objectContaining({
          organizationName: 'Team preview-owner',
          email: newcomer,
          role: 'MEMBER',
          status: 'PENDING',
          hasAccount: false,
        }),
      );
      await http().get('/api/v1/invitations/preview?token=00000000-0000-4000-8000-000000000000').expect(404);
      await http().get('/api/v1/invitations/preview?token=nope').expect(400);
    });

    it('signs a newcomer up straight into the inviting org (no personal org), once', async () => {
      const owner = await login(await register('signup-owner'));
      const newcomer = email('signup-new');
      const token = await invite(owner, newcomer, 'MEMBER');

      // Wrong address → refused, invitation untouched
      await http()
        .post('/api/v1/auth/register')
        .send({ email: email('someone-else'), password: PASSWORD, firstName: 'X', lastName: 'Y', invitationToken: token })
        .expect(403);

      const reg = await http()
        .post('/api/v1/auth/register')
        .send({ email: newcomer, password: PASSWORD, firstName: 'New', lastName: 'Comer', invitationToken: token })
        .expect(201);
      expect(reg.body.data.organization.id).toBe(owner.orgId);

      const session = await login(newcomer);
      expect(session.orgId).toBe(owner.orgId);
      expect(await prisma.organizationMember.count({ where: { userId: session.userId } })).toBe(1);
      const inv = await prisma.invitation.findUnique({ where: { token } });
      expect(inv?.status).toBe('ACCEPTED');

      // The link can't be used again
      await http()
        .post('/api/v1/auth/register')
        .send({ email: email('reuse'), password: PASSWORD, firstName: 'X', lastName: 'Y', invitationToken: token })
        .expect(404);
    });

    it('still requires an organization name when there is no invitation', async () => {
      await http()
        .post('/api/v1/auth/register')
        .send({ email: email('no-org'), password: PASSWORD, firstName: 'X', lastName: 'Y' })
        .expect(422);
    });

    it('shows the link only for pending invitations, and reports lazily-expired ones as EXPIRED', async () => {
      const owner = await login(await register('list-owner'));
      await invite(owner, email('pending'));
      const cancelledToken = await invite(owner, email('cancelled'));
      const expiredToken = await invite(owner, email('expired'));
      const cancelled = await prisma.invitation.findUniqueOrThrow({ where: { token: cancelledToken } });
      await http().delete(`/api/v1/organizations/current/invitations/${cancelled.id}`).set(auth(owner)).expect(204);
      await prisma.invitation.update({ where: { token: expiredToken }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const list = await http().get('/api/v1/organizations/current/invitations').set(auth(owner)).expect(200);
      const byStatus = (s: string) => list.body.data.filter((i: { status: string }) => i.status === s);
      expect(byStatus('PENDING')).toHaveLength(1);
      expect(byStatus('PENDING')[0].invitationToken).toEqual(expect.any(String));
      expect(byStatus('CANCELLED')[0].invitationToken).toBeUndefined();
      expect(byStatus('EXPIRED')[0].invitationToken).toBeUndefined();
    });

    it('lets only one of two concurrent accepts create a membership', async () => {
      const owner = await login(await register('race-owner'));
      const guestEmail = await register('race-guest');
      const guest = await login(guestEmail);
      const token = await invite(owner, guestEmail);
      const results = await Promise.all([
        http().post('/api/v1/invitations/accept').set(auth(guest)).send({ token }),
        http().post('/api/v1/invitations/accept').set(auth(guest)).send({ token }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual(expect.arrayContaining([200]));
      expect(results.every((r) => r.status < 500)).toBe(true);
      expect(
        await prisma.organizationMember.count({ where: { userId: guest.userId, organizationId: owner.orgId } }),
      ).toBe(1);
    });
  });

  // ── Member management ──────────────────────────────────────────────────────

  describe('member management', () => {
    let owner: Session;
    let admin: Session;
    let member: Session;

    beforeAll(async () => {
      owner = await login(await register('mm-owner'));
      admin = await teammate(owner, 'mm-admin', 'ADMIN');
      member = await teammate(owner, 'mm-member', 'MEMBER');
    });

    const setRole = (actor: Session, target: Session, role: string) =>
      http().patch(`/api/v1/organizations/current/members/${target.userId}`).set(auth(actor)).send({ role });

    it('lists members with their user details', async () => {
      const res = await http().get('/api/v1/organizations/current/members').set(auth(member)).expect(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0]).toEqual(
        expect.objectContaining({ userId: owner.userId, role: 'OWNER', user: expect.objectContaining({ email: owner.email }) }),
      );
      expect(JSON.stringify(res.body.data)).not.toMatch(/passwordHash/);
    });

    it('lets an ADMIN manage people ranked below them only', async () => {
      await setRole(admin, member, 'VIEWER').expect(200);
      await setRole(admin, member, 'ADMIN').expect(200); // up to their own rank
      await setRole(admin, member, 'MEMBER').expect(403); // now a peer: hands off
      await setRole(admin, owner, 'MEMBER').expect(403);
      await setRole(owner, member, 'MEMBER').expect(200);
      await setRole(admin, member, 'OWNER').expect(403); // can't grant above themselves
      await setRole(admin, admin, 'OWNER').expect(403); // nor change themselves
      await setRole(member, admin, 'VIEWER').expect(403);
      await setRole(owner, member, 'SUPERUSER').expect(422);
      await http()
        .patch('/api/v1/organizations/current/members/00000000-0000-4000-8000-000000000000')
        .set(auth(owner))
        .send({ role: 'VIEWER' })
        .expect(404);
    });

    it('audits role changes', async () => {
      const log = await prisma.auditLog.findFirst({
        where: { organizationId: owner.orgId, action: 'ORG_MEMBER_ROLE_CHANGED', resourceId: member.userId },
        orderBy: { createdAt: 'desc' },
      });
      expect(log?.metadata).toEqual({ from: 'ADMIN', to: 'MEMBER' });
    });

    it('never leaves an organization without an owner, and nobody leaves their only org', async () => {
      // The owner's only org
      await http().delete(`/api/v1/organizations/current/members/${owner.userId}`).set(auth(owner)).expect(409);
      // Give the owner a second org: still the last OWNER here
      const elsewhere = await login(await register('mm-elsewhere'));
      const token = await invite(elsewhere, owner.email);
      await http().post('/api/v1/invitations/accept').set(auth(owner)).send({ token }).expect(200);
      const last = await http().delete(`/api/v1/organizations/current/members/${owner.userId}`).set(auth(owner)).expect(409);
      expect(last.body.message).toMatch(/last owner/i);
      // With a second owner, leaving works
      await setRole(owner, admin, 'OWNER').expect(200);
      await http().delete(`/api/v1/organizations/current/members/${owner.userId}`).set(auth(owner)).expect(204);
    });
  });

  it('never ends up ownerless when two owners remove or demote each other at once', async () => {
    for (const action of ['remove', 'demote'] as const) {
      const a = await login(await register(`race-a-${action}`));
      const b = await teammate(a, `race-b-${action}`, 'OWNER');
      // Both need another org so "leaving your only org" isn't what stops them
      for (const s of [a, b]) {
        const other = await login(await register(`race-home-${action}`));
        const t = await invite(other, s.email);
        await http().post('/api/v1/invitations/accept').set(auth(s)).send({ token: t }).expect(200);
      }
      const hit = (actor: Session, target: Session) =>
        action === 'remove'
          ? http().delete(`/api/v1/organizations/current/members/${target.userId}`).set(auth(actor))
          : http().patch(`/api/v1/organizations/current/members/${target.userId}`).set(auth(actor)).send({ role: 'ADMIN' });
      const results = await Promise.all([hit(a, b), hit(b, a)]);
      expect(results.every((r) => r.status < 500)).toBe(true);
      expect(await prisma.organizationMember.count({ where: { organizationId: a.orgId, role: 'OWNER' } })).toBe(1);
    }
  });

  // ── Folders, moving, reprocessing ─────────────────────────────────────────

  describe('folders and documents', () => {
    let owner: Session;
    let member: Session;
    let viewer: Session;

    beforeAll(async () => {
      owner = await login(await register('fd-owner'));
      member = await teammate(owner, 'fd-member', 'MEMBER');
      viewer = await teammate(owner, 'fd-viewer', 'VIEWER');
    });

    it('never lists the hidden root folder', async () => {
      const res = await http().get('/api/v1/folders').set(auth(owner)).expect(200);
      expect(res.body.data.map((f: { path: string }) => f.path)).not.toContain('/');
    });

    it('moves documents between folders and filters "root" to unfiled documents', async () => {
      const folder = await http().post('/api/v1/folders').set(auth(member)).send({ name: 'Invoices' }).expect(201);
      const doc = await createDocument(member, `move-me-${runId}.txt`);

      const moved = await http()
        .patch(`/api/v1/documents/${doc.id}`)
        .set(auth(member))
        .send({ folderId: folder.body.data.id })
        .expect(200);
      expect(moved.body.data.folder).toEqual(expect.objectContaining({ id: folder.body.data.id }));

      const inFolder = await http().get(`/api/v1/documents?folderId=${folder.body.data.id}`).set(auth(member)).expect(200);
      expect(inFolder.body.data.items.map((d: { id: string }) => d.id)).toEqual([doc.id]);
      const root = await http().get('/api/v1/documents?folderId=root').set(auth(member)).expect(200);
      expect(root.body.data.items.map((d: { id: string }) => d.id)).not.toContain(doc.id);

      const all = await http().get('/api/v1/folders/all').set(auth(member)).expect(200);
      expect(all.body.data.map((f: { path: string }) => f.path)).toEqual(['/Invoices']);

      const counts = await http().get('/api/v1/folders').set(auth(member)).expect(200);
      expect(counts.body.data.find((f: { id: string }) => f.id === folder.body.data.id)._count.documents).toBe(1);
      // Non-empty folders can't be deleted
      await http().delete(`/api/v1/folders/${folder.body.data.id}`).set(auth(member)).expect(409);

      // Back out of all folders
      await http().patch(`/api/v1/documents/${doc.id}`).set(auth(member)).send({ folderId: null }).expect(200);
      const rootAgain = await http().get('/api/v1/documents?folderId=root').set(auth(member)).expect(200);
      expect(rootAgain.body.data.items.map((d: { id: string }) => d.id)).toContain(doc.id);
      await http().delete(`/api/v1/folders/${folder.body.data.id}`).set(auth(member)).expect(204);
    });

    it('validates moves: permissions, foreign folders, malformed bodies', async () => {
      const ownersDoc = await createDocument(owner, `owners-${runId}.txt`);
      const outsider = await login(await register('fd-outsider'));
      const foreign = await http().post('/api/v1/folders').set(auth(outsider)).send({ name: 'Theirs' }).expect(201);

      await http().patch(`/api/v1/documents/${ownersDoc.id}`).set(auth(viewer)).send({ folderId: null }).expect(403);
      await http().patch(`/api/v1/documents/${ownersDoc.id}`).set(auth(member)).send({ folderId: null }).expect(403);
      await http()
        .patch(`/api/v1/documents/${ownersDoc.id}`)
        .set(auth(owner))
        .send({ folderId: foreign.body.data.id })
        .expect(404);
      await http().patch(`/api/v1/documents/${ownersDoc.id}`).set(auth(owner)).send({}).expect(422);
      await http().patch(`/api/v1/documents/${ownersDoc.id}`).set(auth(owner)).send({ folderId: 'x' }).expect(422);
      await http().get('/api/v1/documents?folderId=elsewhere').set(auth(owner)).expect(422);
    });

    describe('renaming and moving folders', () => {
      const create = async (s: Session, name: string, parentId?: string) =>
        (await http().post('/api/v1/folders').set(auth(s)).send({ name, parentId }).expect(201)).body.data as {
          id: string;
          path: string;
        };
      const paths = async (s: Session) =>
        (await http().get('/api/v1/folders/all').set(auth(s)).expect(200)).body.data.map((f: { path: string }) => f.path);

      let o: Session;
      beforeEach(async () => {
        o = await login(await register('fm-owner'));
      });

      it('renames a folder and rewrites every descendant path, keeping documents inside', async () => {
        const a = await create(o, 'Clients');
        const b = await create(o, 'Acme', a.id);
        await create(o, '2026', b.id);
        // Sibling sharing the prefix must not be touched
        await create(o, 'Clients Archive');
        const doc = await createDocument(o, `in-acme-${runId}.txt`, { folderId: b.id });

        const res = await http().patch(`/api/v1/folders/${a.id}`).set(auth(o)).send({ name: ' Customers ' }).expect(200);
        expect(res.body.data).toEqual(expect.objectContaining({ id: a.id, name: 'Customers', path: '/Customers' }));
        expect(await paths(o)).toEqual(['/Clients Archive', '/Customers', '/Customers/Acme', '/Customers/Acme/2026']);

        const inB = await http().get(`/api/v1/documents?folderId=${b.id}`).set(auth(o)).expect(200);
        expect(inB.body.data.items.map((d: { id: string }) => d.id)).toEqual([doc.id]);

        const audit = await prisma.auditLog.findFirstOrThrow({ where: { resourceId: a.id, action: 'FOLDER_UPDATED' } });
        expect(audit.metadata).toEqual({ from: '/Clients', to: '/Customers' });
      });

      it('moves a subtree under another folder and back to the top level', async () => {
        const a = await create(o, 'Projects');
        const b = await create(o, 'Apollo', a.id);
        await create(o, 'Specs', b.id);
        const archive = await create(o, 'Archive');

        await http().patch(`/api/v1/folders/${b.id}`).set(auth(o)).send({ parentId: archive.id }).expect(200);
        expect(await paths(o)).toEqual(['/Archive', '/Archive/Apollo', '/Archive/Apollo/Specs', '/Projects']);
        const children = await http().get(`/api/v1/folders?parentId=${archive.id}`).set(auth(o)).expect(200);
        expect(children.body.data.map((f: { id: string }) => f.id)).toEqual([b.id]);
        expect(await prisma.auditLog.count({ where: { resourceId: b.id, action: 'FOLDER_MOVED' } })).toBe(1);

        // Move + rename in one request, to the top level
        await http().patch(`/api/v1/folders/${b.id}`).set(auth(o)).send({ parentId: null, name: 'Apollo (2026)' }).expect(200);
        expect(await paths(o)).toEqual(['/Apollo (2026)', '/Apollo (2026)/Specs', '/Archive', '/Projects']);
        const top = await http().get('/api/v1/folders').set(auth(o)).expect(200);
        expect(top.body.data.map((f: { id: string }) => f.id)).toContain(b.id);
      });

      it('rejects cycles, name clashes, the root folder and bad input', async () => {
        const a = await create(o, 'A');
        const b = await create(o, 'B', a.id);
        await create(o, 'Taken');
        const root = await prisma.folder.findFirstOrThrow({ where: { organizationId: o.orgId, path: '/' } });

        await http().patch(`/api/v1/folders/${a.id}`).set(auth(o)).send({ parentId: a.id }).expect(409);
        await http().patch(`/api/v1/folders/${a.id}`).set(auth(o)).send({ parentId: b.id }).expect(409);
        await http().patch(`/api/v1/folders/${a.id}`).set(auth(o)).send({ name: 'Taken' }).expect(409);
        await http().patch(`/api/v1/folders/${b.id}`).set(auth(o)).send({ parentId: null, name: 'Taken' }).expect(409);
        await http().patch(`/api/v1/folders/${root.id}`).set(auth(o)).send({ name: 'x' }).expect(409);
        await http().patch(`/api/v1/folders/${a.id}`).set(auth(o)).send({}).expect(422);
        await http().patch(`/api/v1/folders/${a.id}`).set(auth(o)).send({ name: 'a/b' }).expect(422);
        await http().patch(`/api/v1/folders/${a.id}`).set(auth(o)).send({ name: '   ' }).expect(422);
        await http().patch(`/api/v1/folders/${a.id}`).set(auth(o)).send({ parentId: 'nope' }).expect(422);
        await http().patch(`/api/v1/folders/not-a-uuid`).set(auth(o)).send({ name: 'x' }).expect(400);
        expect(await paths(o)).toEqual(['/A', '/A/B', '/Taken']);

        // Moving into the hidden root folder is the same as the top level
        await http().patch(`/api/v1/folders/${b.id}`).set(auth(o)).send({ parentId: root.id }).expect(200);
        expect(await paths(o)).toEqual(['/A', '/B', '/Taken']);
        // A no-op rename succeeds without an audit entry
        await http().patch(`/api/v1/folders/${a.id}`).set(auth(o)).send({ name: 'A' }).expect(200);
        expect(await prisma.auditLog.count({ where: { resourceId: a.id } })).toBe(0);
      });

      it('enforces roles and tenant boundaries', async () => {
        const a = await create(o, 'Mine');
        const v = await teammate(o, 'fm-viewer', 'VIEWER');
        const m = await teammate(o, 'fm-member', 'MEMBER');
        const outsider = await login(await register('fm-outsider'));
        const theirs = await create(outsider, 'Theirs');

        await http().patch(`/api/v1/folders/${a.id}`).set(auth(v)).send({ name: 'Nope' }).expect(403);
        await http().patch(`/api/v1/folders/${a.id}`).set(auth(outsider)).send({ name: 'Nope' }).expect(404);
        await http().patch(`/api/v1/folders/${a.id}`).set(auth(o)).send({ parentId: theirs.id }).expect(404);
        await http().patch(`/api/v1/folders/${a.id}`).set(auth(m)).send({ name: 'Ours' }).expect(200);
        expect(await paths(outsider)).toEqual(['/Theirs']);
      });

      it('serializes concurrent changes: no duplicate names, no cycles', async () => {
        const [r1, r2] = await Promise.all([
          http().post('/api/v1/folders').set(auth(o)).send({ name: 'Race' }),
          http().post('/api/v1/folders').set(auth(o)).send({ name: 'Race' }),
        ]);
        expect([r1.status, r2.status].sort()).toEqual([201, 409]);

        const x = await create(o, 'X');
        const y = await create(o, 'Y');
        const [m1, m2] = await Promise.all([
          http().patch(`/api/v1/folders/${x.id}`).set(auth(o)).send({ parentId: y.id }),
          http().patch(`/api/v1/folders/${y.id}`).set(auth(o)).send({ parentId: x.id }),
        ]);
        expect([m1.status, m2.status].sort()).toEqual([200, 409]);
        const all: string[] = await paths(o);
        expect(all.filter((p) => p.includes('/X') || p.includes('/Y'))).toHaveLength(2);
      });
    });

    it('reprocesses READY/FAILED documents once, with the same permissions as delete', async () => {
      const failed = await createDocument(member, `failed-${runId}.pdf`, { status: 'FAILED', processingError: 'boom' });

      await http().post(`/api/v1/documents/${failed.id}/reprocess`).set(auth(viewer)).expect(403);
      const res = await http().post(`/api/v1/documents/${failed.id}/reprocess`).set(auth(member)).expect(202);
      expect(res.body.data.status).toBe('PROCESSING');
      expect(docQueue.add).toHaveBeenCalledTimes(1);
      expect(docQueue.add.mock.calls[0][1]).toEqual(expect.objectContaining({ documentId: failed.id }));
      const after = await prisma.document.findUniqueOrThrow({ where: { id: failed.id } });
      expect(after.processingError).toBeNull();

      // Already processing → conflict, nothing queued
      await http().post(`/api/v1/documents/${failed.id}/reprocess`).set(auth(member)).expect(409);
      expect(docQueue.add).toHaveBeenCalledTimes(1);
    });

    it('counts and reindexes documents with missing embeddings or placeholder text (admin, AI required)', async () => {
      const org = await login(await register('reindex-owner'));
      const reader = await teammate(org, 'reindex-member', 'MEMBER');
      const noEmbedding = await createDocument(org, `plain-${runId}.txt`);
      const placeholder = await createDocument(org, `broken-${runId}.pdf`);
      const processing = await createDocument(org, `busy-${runId}.txt`, { status: 'PROCESSING' });
      for (const [doc, content] of [
        [noEmbedding, 'hello world'],
        [placeholder, `[PDF extraction failed: broken-${runId}.pdf]`],
        [processing, 'still going'],
      ] as const) {
        await prisma.documentChunk.create({
          data: { documentId: doc.id, organizationId: org.orgId, content, chunkIndex: 0, tokenCount: 3 },
        });
      }

      const status = await http().get('/api/v1/documents/index-status').set(auth(reader)).expect(200);
      expect(status.body.data.needsIndexing).toBe(2);

      await http().post('/api/v1/documents/reindex').set(auth(reader)).expect(403);
      const noKey = await http().post('/api/v1/documents/reindex').set(auth(org)).expect(503);
      expect(noKey.body.message).toMatch(/api key/i);

      aiAvailable = true;
      const res = await http().post('/api/v1/documents/reindex').set(auth(org)).expect(202);
      expect(res.body.data.queued).toBe(2);
      expect(docQueue.add.mock.calls.map((c) => c[1].documentId).sort()).toEqual([noEmbedding.id, placeholder.id].sort());

      // Claimed documents are PROCESSING now, so a second click queues nothing
      const again = await http().post('/api/v1/documents/reindex').set(auth(org)).expect(202);
      expect(again.body.data.queued).toBe(0);
    });
  });
});
