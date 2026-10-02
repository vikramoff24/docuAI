/**
 * ConversationsService — CRUD for conversations and RAG-powered messaging.
 *
 * Conversations are persistent chat sessions between a user and AI.
 * Each message is stored in the `messages` table with:
 * - role: 'user' | 'assistant' | 'tool'
 * - content: message text
 * - metadata: citations, token usage, model used, retrieved chunk IDs
 *
 * The Q&A flow:
 * 1. User sends message → stored to DB
 * 2. RAGService.retrieveContext() → top-k relevant chunks
 * 3. Build conversation history (last 6 turns) + context
 * 4. RAGService.generateAnswerStream() → stream to client via SSE
 * 5. Assemble full response → store assistant message to DB
 *
 * CONVERSATION HISTORY MANAGEMENT:
 * We include the last 6 turns (3 user + 3 assistant) in each LLM call.
 * This provides enough context for multi-turn conversations without
 * blowing the context window.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  ForbiddenException,
} from '@nestjs/common';
import { MessageRole as PrismaMessageRole } from '@prisma/client';

import { DatabaseService } from '../database/database.service';
import { RAGService, RAGStreamChunk } from '../ai/rag.service';
import type { Message } from '@docuflow/ai';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

/** Max conversation turns to include in history (user + assistant pairs) */
const MAX_HISTORY_TURNS = 6;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly ragService: RAGService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // CRUD
  // ──────────────────────────────────────────────────────────────────────────

  async createConversation(
    userId: string,
    organizationId: string,
    dto: CreateConversationDto,
  ) {
    const conversation = await this.db.conversation.create({
      data: {
        userId,
        organizationId,
        title: dto.title ?? null,
        // Store document scope in metadata
        // (Prisma Conversation has no documentIds field, we use metadata workaround)
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...conversation,
      documentIds: dto.documentIds ?? [],
      messageCount: 0,
    };
  }

  async listConversations(userId: string, organizationId: string) {
    const conversations = await this.db.conversation.findMany({
      where: { userId, organizationId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
    }));
  }

  async getConversation(
    id: string,
    userId: string,
    organizationId: string,
  ) {
    const conversation = await this.db.conversation.findFirst({
      where: { id, userId, organizationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            metadata: true,
            createdAt: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  async deleteConversation(
    id: string,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const conversation = await this.db.conversation.findFirst({
      where: { id, userId, organizationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    await this.db.conversation.delete({ where: { id } });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MESSAGING (RAG-powered)
  // ──────────────────────────────────────────────────────────────────────────

  /** Throws 404 / 503 if a message can't be sent; called before the SSE stream opens. */
  async assertCanSendMessage(conversationId: string, userId: string, organizationId: string) {
    const conversation = await this.db.conversation.findFirst({
      where: { id: conversationId, userId, organizationId },
      select: { id: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (!(await this.ragService.isAvailable(organizationId))) {
      throw new ServiceUnavailableException(
        'AI is not configured: an admin can add an OpenAI API key in Settings',
      );
    }
  }

  /**
   * Send a message and get a streaming AI response.
   * Returns an AsyncGenerator of RAGStreamChunks for SSE transport.
   *
   * Side effects:
   * - Stores user message to DB before generation
   * - Stores assistant message to DB after a completed generation (with citations)
   */
  async *sendMessageStream(
    conversationId: string,
    userId: string,
    organizationId: string,
    dto: SendMessageDto,
  ): AsyncGenerator<RAGStreamChunk> {
    // Verify conversation exists, belongs to user, and AI is configured
    await this.assertCanSendMessage(conversationId, userId, organizationId);

    // 1. Store user message
    await this.db.message.create({
      data: {
        conversationId,
        role: PrismaMessageRole.USER,
        content: dto.content,
        metadata: {},
      },
    });

    // 2. Build conversation history (last N turns)
    const recentMessages = await this.db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY_TURNS,
      select: { role: true, content: true },
    });

    // Reverse to chronological order, exclude the message we just created
    const history: Message[] = recentMessages
      .reverse()
      .slice(0, -1) // Exclude the user message we just stored
      .map((m) => ({
        role: m.role.toLowerCase() as Message['role'],
        content: m.content,
      }));

    // 3. Retrieve relevant context
    const chunks = await this.ragService.retrieveContext(
      dto.content,
      organizationId,
      { documentIds: dto.documentIds },
    );

    this.logger.log(
      `Conversation ${conversationId}: retrieved ${chunks.length} chunks for: "${dto.content.slice(0, 50)}..."`,
    );

    // 4. Stream the AI response, collecting the full content for DB storage
    let fullContent = '';
    let citationsData: unknown = [];
    let completed = false;

    for await (const chunk of this.ragService.generateAnswerStream(
      organizationId,
      dto.content,
      chunks,
      history,
    )) {
      if (chunk.type === 'chunk') {
        fullContent += chunk.content ?? '';
      } else if (chunk.type === 'citations') {
        citationsData = chunk.citations ?? [];
      } else if (chunk.type === 'done') {
        completed = true;
      }
      yield chunk;
    }

    // A failed or empty generation isn't an answer: don't persist it (it would
    // also be fed back to the model as history on the next turn).
    if (!completed || !fullContent.trim()) {
      this.logger.warn(`Conversation ${conversationId}: stream did not complete; no answer stored`);
      return;
    }

    // 5. Store assistant message with citations metadata
    await this.db.message.create({
      data: {
        conversationId,
        role: PrismaMessageRole.ASSISTANT,
        content: fullContent,
        metadata: {
          citations: citationsData as object,
          chunksRetrieved: chunks.length,
          model: 'gpt-4o-mini',
        },
      },
    });

    // 6. Update conversation updatedAt (implicit via message creation)
    await this.db.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    this.logger.log(
      `Conversation ${conversationId}: stored assistant response (${fullContent.length} chars)`,
    );
  }
}
