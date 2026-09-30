/**
 * Search Integration Tests — Phase 4
 *
 * Tests the search API against real PostgreSQL (with tsvector) and pgvector.
 *
 * Strategy:
 *   We create documents via the API (POST /documents/upload-url),
 *   then manually UPDATE their status to READY and populate searchVector
 *   via direct Prisma calls (bypassing the worker pipeline).
 *   This lets us test search logic independently of the worker.
 *
 * Test coverage:
 * 1. GET /search?q=...&mode=fulltext    → full-text search (tsvector + ts_rank)
 * 2. GET /search?q=...&mode=semantic   → degrades to fulltext (no API key in test)
 * 3. GET /search?q=...&mode=hybrid     → hybrid (degrades to fulltext without API key)
 * 4. GET /search?q=...&folderId=...    → folder filter
 * 5. GET /search?q=...&tags[]=...      → tag filter
 * 6. GET /search?q=...&mimeType=...    → MIME type filter
 * 7. GET /search/suggest?q=...         → typeahead suggestions
 * 8. Multi-tenancy: Org A can't see Org B docs in search results
 *
 * Prerequisites (running locally):
 *   - PostgreSQL with pgvector + pg_trgm extensions
 *   - Redis (for JWT blacklist)
 *   - LocalStack S3 with 'docuflow-dev' bucket
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { PrismaClient, DocumentStatus } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// ── Test users ────────────────────────────────────────────────────────────────

const timestamp = Date.now();

const USER_A = {
  email: `search-test-a-${timestamp}@integration.test`,
  password: 'SearchTest123!',
  firstName: 'Search',
  lastName: 'UserA',
  organizationName: `Search Test Org A ${timestamp}`,
};

const USER_B = {
  email: `search-test-b-${timestamp}@integration.test`,
  password: 'SearchTest123!',
  firstName: 'Search',
  lastName: 'UserB',
  organizationName: `Search Test Org B ${timestamp}`,
};

// ── Helper: Create a READY document via API + direct DB update ────────────────

interface CreateReadyDocParams {
  app: NestFastifyApplication;
  prisma: PrismaClient;
  token: string;
  organizationId: string;
  name: string;
  description?: string;
  tags?: string[];
  mimeType?: string;
  folderId?: string;
}

async function createReadyDocument(params: CreateReadyDocParams): Promise<string> {
  const {
    app, prisma, token, organizationId, name, description, tags, mimeType = 'text/plain', folderId,
  } = params;

  // 1. Request presigned upload URL
  const uploadRes = await request(app.getHttpServer())
    .post('/api/v1/documents/upload-url')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name,
      description: description ?? null,
      mimeType,
      sizeBytes: 100,
      tags: tags ?? [],
      ...(folderId ? { folderId } : {}),
    })
    .expect(201);

  const documentId: string = uploadRes.body.data.documentId;

  // 2. Directly set document to READY and populate searchVector
  // (bypass worker pipeline — we're testing search, not processing)
  await prisma.$executeRaw`
    UPDATE "documents"
    SET
      "status" = 'READY',
      "searchVector" =
        setweight(to_tsvector('english', ${name}), 'A') ||
        setweight(to_tsvector('english', COALESCE(${description ?? ''}, '')), 'B') ||
        setweight(to_tsvector('english', array_to_string(${tags ?? []}::text[], ' ')), 'C')
    WHERE "id" = ${documentId}::uuid
      AND "organizationId" = ${organizationId}::uuid
  `;

  return documentId;
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('Search Integration Tests', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;

  // Org A state
  let tokenA: string;
  let orgAId: string;

  // Org B state
  let tokenB: string;
  let orgBId: string;

  // Test document IDs for cleanup
  const docIds: string[] = [];

  // Test folder ID
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
        forbidNonWhitelisted: false,
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

    // Create a folder for Org A
    const folderRes = await request(app.getHttpServer())
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Finance Docs' })
      .expect(201);

    folderId = folderRes.body.data.id;

    // ── Seed test documents for Org A ─────────────────────────────────────

    // Doc 1: Invoice processing
    const doc1 = await createReadyDocument({
      app, prisma, token: tokenA, organizationId: orgAId,
      name: 'Invoice Processing Guide',
      description: 'Instructions for handling supplier invoices and payment workflows',
      tags: ['finance', 'invoices', 'accounts-payable'],
      mimeType: 'application/pdf',
      folderId,
    });
    docIds.push(doc1);

    // Doc 2: Budget report
    const doc2 = await createReadyDocument({
      app, prisma, token: tokenA, organizationId: orgAId,
      name: 'Q3 2026 Budget Report',
      description: 'Quarterly budget analysis and forecast for the finance team',
      tags: ['finance', 'budget', 'quarterly'],
      mimeType: 'application/pdf',
    });
    docIds.push(doc2);

    // Doc 3: Employee handbook
    const doc3 = await createReadyDocument({
      app, prisma, token: tokenA, organizationId: orgAId,
      name: 'Employee Onboarding Handbook',
      description: 'HR policies, benefits overview, and onboarding procedures',
      tags: ['hr', 'onboarding', 'policies'],
      mimeType: 'text/plain',
    });
    docIds.push(doc3);

    // Doc 4: Contract template
    const doc4 = await createReadyDocument({
      app, prisma, token: tokenA, organizationId: orgAId,
      name: 'Vendor Contract Template',
      description: 'Standard vendor agreement template with legal terms',
      tags: ['legal', 'contracts', 'vendors'],
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    docIds.push(doc4);

    // ── Org B doc (should NOT appear in Org A searches) ───────────────────

    const orgBDoc = await createReadyDocument({
      app, prisma, token: tokenB, organizationId: orgBId,
      name: 'Invoice Processing Guide',
      description: 'Org B version of invoice handling',
      tags: ['finance'],
    });
    docIds.push(orgBDoc);
  }, 30000); // 30s timeout for setup

  afterAll(async () => {
    // Clean up test data in dependency order
    try {
      await prisma.documentChunk.deleteMany({
        where: { organizationId: { in: [orgAId, orgBId].filter(Boolean) } },
      });
      await prisma.document.deleteMany({
        where: { id: { in: docIds } },
      });
      await prisma.folder.deleteMany({
        where: { id: { in: folderId ? [folderId] : [] } },
      });
      await prisma.refreshToken.deleteMany({
        where: { user: { email: { in: [USER_A.email, USER_B.email] } } },
      });
      await prisma.organizationMember.deleteMany({
        where: { organizationId: { in: [orgAId, orgBId].filter(Boolean) } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [orgAId, orgBId].filter(Boolean) } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [USER_A.email, USER_B.email] } },
      });
    } finally {
      await prisma.$disconnect();
      await app.close();
    }
  });

  // ── Auth protection ──────────────────────────────────────────────────────

  describe('Auth', () => {
    it('GET /search — 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search?q=invoice')
        .expect(401);

      expect(res.body.statusCode).toBe(401);
    });

    it('GET /search/suggest — 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/search/suggest?q=inv')
        .expect(401);
    });
  });

  // ── Fulltext Search ──────────────────────────────────────────────────────

  describe('Fulltext Search (mode=fulltext)', () => {
    it('should find documents matching keyword in name', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search?q=invoice&mode=fulltext')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const { data } = res.body;
      expect(data.results).toBeDefined();
      expect(data.results.length).toBeGreaterThan(0);
      expect(data.mode).toBe('fulltext');
      expect(data.query).toBe('invoice');

      // Should find the invoice doc
      const names = data.results.map((r: { name: string }) => r.name);
      expect(names.some((n: string) => n.toLowerCase().includes('invoice'))).toBe(true);
    });

    it('should find documents matching keyword in description', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search?q=onboarding&mode=fulltext')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.results.length).toBeGreaterThan(0);
      const names = res.body.data.results.map((r: { name: string }) => r.name);
      expect(names.some((n: string) => n.toLowerCase().includes('handbook'))).toBe(true);
    });

    it('should return empty results for non-matching query', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search?q=xyznonexistent123&mode=fulltext')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.results).toHaveLength(0);
      expect(res.body.data.total).toBe(0);
    });

    it('should include score and took in response', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search?q=finance&mode=fulltext')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const { data } = res.body;
      expect(data.took).toBeGreaterThanOrEqual(0);
      expect(data.hasMore).toBeDefined();
      if (data.results.length > 0) {
        expect(data.results[0].score).toBeGreaterThan(0);
      }
    });

    it('should return 400 for empty query', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/search?q=&mode=fulltext')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
    });
  });

  // ── Hybrid Search (default) ──────────────────────────────────────────────

  describe('Hybrid Search (mode=hybrid, default)', () => {
    it('should default to hybrid mode', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search?q=invoice')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Without API key, hybrid falls back to fulltext
      expect(res.body.data.results).toBeDefined();
      expect(res.body.data.query).toBe('invoice');
    });

    it('hybrid mode with explicit parameter works', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search?q=budget+quarterly&mode=hybrid')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.results).toBeDefined();
    });
  });

  // ── Semantic Search ──────────────────────────────────────────────────────

  describe('Semantic Search (mode=semantic)', () => {
    it('should fall back to fulltext when no API key', async () => {
      // In test env, OPENAI_API_KEY is likely not set, so semantic degrades to fulltext
      const res = await request(app.getHttpServer())
        .get('/api/v1/search?q=invoice&mode=semantic')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Should still return results (graceful degradation)
      expect(res.body.data.results).toBeDefined();
      expect(res.body.data.query).toBe('invoice');
    });
  });

  // ── Filter: folderId ─────────────────────────────────────────────────────

  describe('Filter: folderId', () => {
    it('should only return documents in the specified folder', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/search?q=invoice&mode=fulltext&folderId=${folderId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const results = res.body.data.results;
      // All results should be in the specified folder
      for (const doc of results) {
        expect(doc.folderId).toBe(folderId);
      }
    });

    it('should return no results for wrong folderId', async () => {
      // Use a valid UUID v4 that doesn't match any real folder
      const nonExistentFolder = 'a0000000-0000-4000-8000-000000000001';
      const res = await request(app.getHttpServer())
        .get(`/api/v1/search?q=invoice&mode=fulltext&folderId=${nonExistentFolder}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.results).toHaveLength(0);
    });
  });

  // ── Filter: tags ─────────────────────────────────────────────────────────

  describe('Filter: tags', () => {
    it('should filter by single tag', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search?q=document&mode=fulltext&tags[]=finance')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const results = res.body.data.results;
      // All returned documents should have the 'finance' tag
      for (const doc of results) {
        expect(doc.tags).toContain('finance');
      }
    });

    it('should filter by multiple tags (AND logic)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search?q=report&mode=fulltext&tags[]=finance&tags[]=budget')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const results = res.body.data.results;
      for (const doc of results) {
        expect(doc.tags).toContain('finance');
        expect(doc.tags).toContain('budget');
      }
    });
  });

  // ── Filter: mimeType ─────────────────────────────────────────────────────

  describe('Filter: mimeType', () => {
    it('should filter by MIME type prefix', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search?q=finance&mode=fulltext&mimeType=application%2Fpdf')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const results = res.body.data.results;
      for (const doc of results) {
        expect(doc.mimeType).toMatch(/^application\/pdf/);
      }
    });
  });

  // ── Pagination ───────────────────────────────────────────────────────────

  describe('Pagination', () => {
    it('should respect limit parameter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search?q=document&mode=fulltext&limit=2')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.results.length).toBeLessThanOrEqual(2);
    });

    it('should respect offset parameter', async () => {
      // Get first 10 results
      const res1 = await request(app.getHttpServer())
        .get('/api/v1/search?q=the&mode=fulltext&limit=10&offset=0')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Get results with offset 1
      const res2 = await request(app.getHttpServer())
        .get('/api/v1/search?q=the&mode=fulltext&limit=10&offset=1')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // They should be different (offset shifts results)
      if (res1.body.data.results.length > 1 && res2.body.data.results.length > 0) {
        expect(res1.body.data.results[1].id).toBe(res2.body.data.results[0].id);
      }
    });
  });

  // ── Typeahead Suggestions ────────────────────────────────────────────────

  describe('Typeahead Suggestions (GET /search/suggest)', () => {
    it('should return suggestions for prefix query', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search/suggest?q=inv')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.suggestions).toBeDefined();
      expect(Array.isArray(res.body.data.suggestions)).toBe(true);

      // Should find "Invoice Processing Guide"
      if (res.body.data.suggestions.length > 0) {
        expect(res.body.data.suggestions[0]).toHaveProperty('id');
        expect(res.body.data.suggestions[0]).toHaveProperty('name');
        expect(res.body.data.suggestions[0]).toHaveProperty('mimeType');
      }
    });

    it('should return empty for query shorter than 2 chars', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search/suggest?q=i')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.suggestions).toHaveLength(0);
    });

    it('should return max 8 suggestions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search/suggest?q=doc')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.suggestions.length).toBeLessThanOrEqual(8);
    });
  });

  // ── Multi-tenancy ────────────────────────────────────────────────────────

  describe('Multi-tenancy: Cross-org isolation', () => {
    it('Org B documents should NOT appear in Org A search results', async () => {
      // Search for "Invoice" — both orgs have this document
      const res = await request(app.getHttpServer())
        .get('/api/v1/search?q=invoice&mode=fulltext')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const results = res.body.data.results;

      // All results must belong to Org A
      for (const doc of results) {
        // The doc should be accessible by Org A (verify via GET /documents/:id)
        const docRes = await request(app.getHttpServer())
          .get(`/api/v1/documents/${doc.id}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);

        expect(docRes.body.data.id).toBe(doc.id);
      }

      // Verify Org B can't see Org A's documents via search
      const resB = await request(app.getHttpServer())
        .get('/api/v1/search?q=invoice&mode=fulltext')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      // Org B's results should only include Org B's documents
      const orgADocIds = new Set(docIds.slice(0, 4)); // First 4 are Org A's
      const orgBResults = resB.body.data.results;

      for (const doc of orgBResults) {
        // Org B results should NOT contain Org A document IDs
        expect(orgADocIds.has(doc.id)).toBe(false);
      }
    });
  });
});
