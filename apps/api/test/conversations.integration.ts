import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AI_PROVIDER_TOKEN } from '../src/ai/ai.constants';
import { AIProvider, CompletionResult, EmbeddingResult, StreamChunk, Message } from '@docuflow/ai';

// ── Mock AI Provider ──────────────────────────────────────────────────────────

class MockAIProvider implements AIProvider {
  name = 'mock';
  defaultModel = 'mock-model';
  embeddingModel = 'mock-embedding-model';

  isAvailable(): boolean {
    return true;
  }

  async complete(messages: Message[], options?: any): Promise<CompletionResult> {
    return {
      content: '{"summary": "Mock summary", "keyPoints": ["Point 1", "Point 2"]}',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      model: this.defaultModel,
    };
  }

  async *stream(messages: Message[], options?: any): AsyncGenerator<StreamChunk> {
    yield { content: 'This is a ', done: false };
    yield { content: 'mocked AI response.', done: false };
    yield { content: '', done: true, finishReason: 'stop' };
  }

  async embed(texts: string[]): Promise<EmbeddingResult[]> {
    return texts.map(() => ({
      embedding: new Array(1536).fill(0.1),
      tokenCount: 5,
      model: this.embeddingModel,
    }));
  }
}

// ── Test users ────────────────────────────────────────────────────────────────

const timestamp = Date.now();

const USER_A = {
  email: `conv-test-a-${timestamp}@integration.test`,
  password: 'ConvTest123!',
  firstName: 'Conv',
  lastName: 'UserA',
  organizationName: `Conv Test Org A ${timestamp}`,
};

const USER_B = {
  email: `conv-test-b-${timestamp}@integration.test`,
  password: 'ConvTest123!',
  firstName: 'Conv',
  lastName: 'UserB',
  organizationName: `Conv Test Org B ${timestamp}`,
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('Conversations Integration Tests', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;

  // Org A state
  let tokenA: string;
  let orgAId: string;
  let userAId: string;

  // Org B state
  let tokenB: string;
  let orgBId: string;
  let userBId: string;

  let conversationId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AI_PROVIDER_TOKEN)
      .useClass(MockAIProvider)
      .compile();

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
    userAId = regA.body.data.user.id;

    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: USER_A.email, password: USER_A.password })
      .expect(200);

    tokenA = loginA.body.data.tokens.accessToken;

    // Register and login User B
    const regB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(USER_B)
      .expect(201);

    orgBId = regB.body.data.organization.id;
    userBId = regB.body.data.user.id;

    const loginB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: USER_B.email, password: USER_B.password })
      .expect(200);

    tokenB = loginB.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    // Clean up test data in dependency order
    try {
      await prisma.message.deleteMany({
        where: { conversation: { userId: { in: [userAId, userBId] } } },
      });
      await prisma.conversation.deleteMany({
        where: { userId: { in: [userAId, userBId] } },
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
    } finally {
      await prisma.$disconnect();
      await app.close();
    }
  });

  describe('CRUD Conversations', () => {
    it('POST /conversations — should create a conversation', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Test Conversation' })
        .expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.title).toBe('Test Conversation');
      conversationId = res.body.data.id;
    });

    it('GET /conversations — should list user conversations', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const conv = res.body.data.find((c: any) => c.id === conversationId);
      expect(conv).toBeDefined();
    });

    it('GET /conversations/:id — should get a specific conversation', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.id).toBe(conversationId);
      expect(res.body.data.messages).toEqual([]);
    });

    it('GET /conversations/:id — should return 404 for different user', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });

  describe('Messaging (SSE)', () => {
    it('POST /conversations/:id/messages — should stream response', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ content: 'Hello AI' })
        .expect(200);

      // Verify the stream content
      expect(res.headers['content-type']).toContain('text/event-stream');
      const text = res.text;
      
      expect(text).toContain('"type":"chunk","content":"This is a "');
      expect(text).toContain('"type":"chunk","content":"mocked AI response."');
      expect(text).toContain('"type":"done"');
    });

    it('GET /conversations/:id — should include stored messages', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.messages.length).toBe(2);
      expect(res.body.data.messages[0].role).toBe('USER');
      expect(res.body.data.messages[0].content).toBe('Hello AI');
      expect(res.body.data.messages[1].role).toBe('ASSISTANT');
      expect(res.body.data.messages[1].content).toBe('This is a mocked AI response.');
    });
  });

  describe('Document Summarization', () => {
    it('POST /ai/documents/:id/summarize — should return JSON summary', async () => {
      // Assuming a random valid UUID since the mock AI provider will just return the JSON regardless of document existence.
      // Wait, the summarizeDocument method checks if the document exists in the DB. We should create one.
      
      const doc = await prisma.document.create({
        data: {
          organizationId: orgAId,
          name: 'Test Doc',
          mimeType: 'text/plain',
          sizeBytes: 100,
          status: 'READY',
          storageKey: `docs/${orgAId}/test-doc.txt`,
          createdById: userAId,
          chunks: {
            create: {
              organizationId: orgAId,
              content: 'This is a test document content for summarization.',
              chunkIndex: 0,
              tokenCount: 10,
            }
          }
        }
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/ai/documents/${doc.id}/summarize`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.summary).toBe('Mock summary');
      expect(res.body.data.keyPoints.length).toBe(2);

      await prisma.document.delete({ where: { id: doc.id } });
    });
  });
});
