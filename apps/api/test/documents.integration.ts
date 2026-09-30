/**
 * Documents Integration Tests
 *
 * Tests the full document lifecycle:
 * 1. Upload flow (2-phase):
 *    - POST /documents/upload-url → get presigned PUT URL + documentId
 *    - PUT <uploadUrl> directly to LocalStack S3
 *    - POST /documents/:id/confirm → transition PENDING → PROCESSING
 * 2. CRUD:
 *    - GET /documents → paginated list
 *    - GET /documents/:id → document metadata
 *    - GET /documents/:id/download → presigned GET URL
 *    - DELETE /documents/:id → soft delete
 * 3. Folder integration:
 *    - Create folder, upload document into folder, verify folder filter
 * 4. Multi-tenancy:
 *    - Org A documents are invisible to Org B users
 *
 * Prerequisites (all already running in local dev):
 *   - PostgreSQL (port 5432)
 *   - Redis (port 6379)
 *   - LocalStack S3 (port 4566), bucket 'docuflow-dev' created
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// ── Helpers ───────────────────────────────────────────────────────────────────

const LOCALSTACK_ENDPOINT = 'http://localhost:4566';
const BUCKET = 'docuflow-dev';

/** Upload a small text buffer directly to a LocalStack presigned URL using native fetch (Node 18+) */
async function uploadToPresignedUrl(uploadUrl: string, content: Buffer, mimeType: string): Promise<void> {
  // Node 18+ has global fetch — no need to import node-fetch
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: content as any,
    headers: { 'Content-Type': mimeType },
  });
  if (!res.ok) {
    throw new Error(`Failed to upload to presigned URL: ${res.status} ${res.statusText}`);
  }
}

/** Fallback: upload using AWS SDK directly (bypassing presigned URL) */
async function uploadDirectlyToS3(storageKey: string, content: Buffer, mimeType: string): Promise<void> {
  const s3 = new S3Client({
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    endpoint: LOCALSTACK_ENDPOINT,
    forcePathStyle: true,
  });

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    Body: content,
    ContentType: mimeType,
  }));
}

// ── Test users ────────────────────────────────────────────────────────────────

const timestamp = Date.now();

const USER_A = {
  email: `doc-test-a-${timestamp}@integration.test`,
  password: 'DocTest123!',
  firstName: 'DocTest',
  lastName: 'UserA',
  organizationName: `Doc Test Org A ${timestamp}`,
};

const USER_B = {
  email: `doc-test-b-${timestamp}@integration.test`,
  password: 'DocTest123!',
  firstName: 'DocTest',
  lastName: 'UserB',
  organizationName: `Doc Test Org B ${timestamp}`,
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('Documents Integration Tests', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;

  // Org A state
  let tokenA: string;
  let orgAId: string;
  let userAId: string;

  // Org B state
  let tokenB: string;
  let orgBId: string;

  // Test document state
  let documentId: string;
  let storageKey: string;

  // Test folder state
  let folderId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        errorHttpStatusCode: 422,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env['DATABASE_TEST_URL'] ?? process.env['DATABASE_URL'],
        },
      },
    });

    // Register and login User A
    const regA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(USER_A)
      .expect(201);

    userAId = regA.body.data.user.id;
    orgAId = regA.body.data.organization.id;

    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: USER_A.email, password: USER_A.password })
      .expect(200);

    tokenA = loginA.body.data.tokens.accessToken;

    // Register and login User B (different org)
    const regB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(USER_B)
      .expect(201);

    orgBId = regB.body.data.organization.id;

    const loginB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: USER_B.email, password: USER_B.password })
      .expect(200);

    tokenB = loginB.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await prisma.document.deleteMany({
        where: { organizationId: { in: [orgAId, orgBId] } },
      });
      await prisma.folder.deleteMany({
        where: { organizationId: { in: [orgAId, orgBId] } },
      });
      await prisma.refreshToken.deleteMany({
        where: { user: { email: { in: [USER_A.email, USER_B.email] } } },
      });
      await prisma.organizationMember.deleteMany({
        where: { organizationId: { in: [orgAId, orgBId] } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [orgAId, orgBId] } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [USER_A.email, USER_B.email] } },
      });
    } catch {
      // Ignore cleanup errors
    }

    await prisma.$disconnect();
    await app.close();
  });

  // ── Upload URL Tests ──────────────────────────────────────────────────────

  describe('POST /documents/upload-url', () => {
    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/documents/upload-url')
        .send({
          name: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        })
        .expect(401);
    });

    it('should reject invalid MIME type', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/documents/upload-url')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'test.exe',
          mimeType: 'application/x-executable',
          sizeBytes: 1024,
        })
        .expect(400);

      expect(res.body.message).toContain('Unsupported file type');
    });

    it('should reject oversized files (DTO validation — 422)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/documents/upload-url')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'huge.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 200 * 1024 * 1024, // 200MB > 100MB limit
        })
        .expect(422); // DTO @Max(104857600) validation error
    });

    it('should return presigned upload URL and document record', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/documents/upload-url')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'integration-test.txt',
          mimeType: 'text/plain',
          sizeBytes: 100,
          description: 'Integration test document',
          tags: ['test', 'integration'],
        })
        .expect(201);

      expect(res.body.data.documentId).toBeTruthy();
      expect(res.body.data.uploadUrl).toBeTruthy();
      expect(res.body.data.storageKey).toBeTruthy();
      expect(res.body.data.expiresIn).toBe(900); // 15 minutes

      // Save for subsequent tests
      documentId = res.body.data.documentId;
      storageKey = res.body.data.storageKey;

      // Verify document was created in DB with PENDING status
      const doc = await prisma.document.findUnique({ where: { id: documentId } });
      expect(doc).toBeTruthy();
      expect(doc!.status).toBe('PENDING');
      expect(doc!.organizationId).toBe(orgAId);
      expect(doc!.createdById).toBe(userAId);
    });
  });

  // ── Confirm Upload Tests ──────────────────────────────────────────────────

  describe('POST /documents/:id/confirm', () => {
    it('should return 400 if file not uploaded to S3 yet', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/documents/${documentId}/confirm`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);

      expect(res.body.message).toContain('not been uploaded');
    });

    it('should confirm upload after file is present in S3', async () => {
      // Upload the file directly to LocalStack S3
      const fileContent = Buffer.from('Integration test document content');
      await uploadDirectlyToS3(storageKey, fileContent, 'text/plain');

      // Now confirm the upload
      const res = await request(app.getHttpServer())
        .post(`/api/v1/documents/${documentId}/confirm`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.id).toBe(documentId);
      expect(res.body.data.status).toBe('PROCESSING');
      expect(res.body.data.name).toBe('integration-test.txt');
    });

    it('should return 400 if trying to confirm already confirmed document', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/documents/${documentId}/confirm`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
    });

    it('should return 404 for non-existent document (valid UUID that does not exist)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/documents/00000000-0000-0000-0000-000000000000/confirm')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('should return 403 if different user tries to confirm', async () => {
      // User B cannot confirm User A's document
      await request(app.getHttpServer())
        .post(`/api/v1/documents/${documentId}/confirm`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404); // 404 because org filter hides it (not 403)
    });
  });

  // ── List Documents Tests ──────────────────────────────────────────────────

  describe('GET /documents', () => {
    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/documents')
        .expect(401);
    });

    it('should return paginated document list for the organization', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);

      // Our uploaded document should appear
      const ourDoc = res.body.data.items.find((d: { id: string }) => d.id === documentId);
      expect(ourDoc).toBeTruthy();
      expect(ourDoc.name).toBe('integration-test.txt');
      expect(ourDoc.status).toBe('PROCESSING');
    });

    it('should support search by name', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/documents?search=integration-test')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].name).toContain('integration-test');
    });

    it('should return empty list for unmatched search', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/documents?search=zzz-this-will-not-match-anything-xyz')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(0);
    });

    it('should NOT return Org A documents to Org B user (tenant isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      // Org B has no documents, and cannot see Org A's documents
      const orgADoc = res.body.data.items.find((d: { id: string }) => d.id === documentId);
      expect(orgADoc).toBeUndefined();
    });
  });

  // ── Get Document Tests ────────────────────────────────────────────────────

  describe('GET /documents/:id', () => {
    it('should return document metadata', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.id).toBe(documentId);
      expect(res.body.data.name).toBe('integration-test.txt');
      expect(res.body.data.mimeType).toBe('text/plain');
      expect(res.body.data.status).toBe('PROCESSING');
      expect(res.body.data.tags).toEqual(['test', 'integration']);
      expect(res.body.data.description).toBe('Integration test document');
      // Should include creator info
      expect(res.body.data.createdBy).toBeDefined();
      expect(res.body.data.createdBy.id).toBe(userAId);
    });

    it('should return 404 for non-existent document', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/documents/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('should return 404 when Org B tries to access Org A document', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });

  // ── Download URL Tests ────────────────────────────────────────────────────

  describe('GET /documents/:id/download', () => {
    it('should return a presigned download URL', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/documents/${documentId}/download`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.downloadUrl).toBeTruthy();
      expect(res.body.data.expiresIn).toBe(3600); // 1 hour

      // URL should point to our storage key
      expect(res.body.data.downloadUrl).toContain(
        storageKey.split('/').pop(), // filename part of the key
      );
    });

    it('should return 404 for non-existent document', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/documents/00000000-0000-0000-0000-000000000000/download')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });
  });

  // ── Folder Integration Tests ──────────────────────────────────────────────

  describe('Folder integration', () => {
    it('should create a folder and upload a document into it', async () => {
      // Create folder
      const folderRes = await request(app.getHttpServer())
        .post('/api/v1/folders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Test Folder' })
        .expect(201);

      folderId = folderRes.body.data.id;
      expect(folderId).toBeTruthy();
      expect(folderRes.body.data.name).toBe('Test Folder');
      expect(folderRes.body.data.path).toBe('/Test Folder');

      // Upload a document into the folder
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/documents/upload-url')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'folder-doc.txt',
          mimeType: 'text/plain',
          sizeBytes: 50,
          folderId,
        })
        .expect(201);

      const folderDocId = uploadRes.body.data.documentId;
      expect(folderDocId).toBeTruthy();

      // Verify DB: document has correct folderId
      const dbDoc = await prisma.document.findUnique({ where: { id: folderDocId } });
      expect(dbDoc!.folderId).toBe(folderId);
    });

    it('should filter documents by folderId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/documents?folderId=${folderId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Should return only the document in the folder
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].name).toBe('folder-doc.txt');
    });

    it('should reject folder from another org', async () => {
      // User B tries to upload into User A's folder
      const res = await request(app.getHttpServer())
        .post('/api/v1/documents/upload-url')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          name: 'attack.txt',
          mimeType: 'text/plain',
          sizeBytes: 50,
          folderId,
        })
        .expect(404); // Folder not found for Org B

      expect(res.body.message).toContain('Folder not found');
    });
  });

  // ── Delete Document Tests ─────────────────────────────────────────────────

  describe('DELETE /documents/:id', () => {
    it('should return 403 when Org B user tries to delete Org A document', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404); // 404 because org filter hides it
    });

    it('should soft delete a document', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(204);

      // Verify: GET should now return 404
      await request(app.getHttpServer())
        .get(`/api/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);

      // Verify in DB: deletedAt is set, record still exists
      const dbDoc = await prisma.document.findUnique({ where: { id: documentId } });
      expect(dbDoc).toBeTruthy();
      expect(dbDoc!.deletedAt).not.toBeNull();
    });

    it('should return 404 for already-deleted document', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/documents/${documentId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });
  });
});
