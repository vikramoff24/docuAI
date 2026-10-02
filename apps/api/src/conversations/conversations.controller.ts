/**
 * ConversationsController — REST endpoints for AI conversations.
 *
 * Endpoints:
 * - POST   /conversations                        → create conversation
 * - GET    /conversations                        → list conversations
 * - GET    /conversations/:id                    → get conversation with messages
 * - DELETE /conversations/:id                    → delete conversation
 * - POST   /conversations/:id/messages           → send message (SSE stream response)
 * - POST   /documents/:id/summarize              → summarize document (SSE stream)
 *
 * SSE STREAMING:
 * The POST /conversations/:id/messages endpoint returns Server-Sent Events.
 * The client receives incremental text chunks as the LLM generates them.
 *
 * Response format:
 *   data: {"type":"chunk","content":"The payment terms are "}
 *   data: {"type":"chunk","content":"Net 30 days from invoice date."}
 *   data: {"type":"citations","citations":[{"documentId":"...","documentName":"...","chunkIndex":2}]}
 *   data: {"type":"done"}
 *
 * WHY SSE INSTEAD OF WEBSOCKETS?
 * SSE is simpler for unidirectional streaming (server → client).
 * Websockets are bidirectional — overkill for text generation.
 * SSE works naturally with HTTP/2, proxies, and auth headers.
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  Res,
  ParseUUIDPipe,
  NotFoundException,
  HttpException,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { RateLimit } from '../common/rate-limit/rate-limit';

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  private readonly logger = new Logger(ConversationsController.name);

  constructor(private readonly conversationsService: ConversationsService) {}

  /**
   * POST /conversations
   * Create a new conversation.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createConversation(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationsService.createConversation(
      user.userId,
      user.organizationId,
      dto,
    );
  }

  /**
   * GET /conversations
   * List all conversations for the current user (paginated by updatedAt DESC).
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listConversations(@CurrentUser() user: RequestUser) {
    return this.conversationsService.listConversations(
      user.userId,
      user.organizationId,
    );
  }

  /**
   * GET /conversations/:id
   * Get a conversation with its full message history.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getConversation(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversationsService.getConversation(
      id,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * DELETE /conversations/:id
   * Delete a conversation and all its messages.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConversation(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.conversationsService.deleteConversation(
      id,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * POST /conversations/:id/messages
   *
   * Send a message and receive a streaming AI response via SSE.
   *
   * Request body: { content: string, documentIds?: string[] }
   *
   * Response (SSE stream):
   *   Content-Type: text/event-stream
   *   data: {"type":"chunk","content":"..."}  (repeated)
   *   data: {"type":"citations","citations":[...]}
   *   data: {"type":"done"}
   *
   * Errors during streaming are sent as:
   *   data: {"type":"error","error":"..."}
   */
  @RateLimit('aiChat')
  @Post(':id/messages')
  async sendMessage(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Res() res: FastifyReply,
  ) {
    this.logger.debug(
      `SSE stream: conversation=${id} user=${user.userId} query="${dto.content.slice(0, 50)}..."`,
    );

    // Set SSE headers
    // Fail fast with a real HTTP status (404 / 503) before the stream starts
    await this.conversationsService.assertCanSendMessage(id, user.userId, user.organizationId);

    res.raw.writeHead(200, {
      // Keep headers already set on the reply (CORS, request id) — writeHead on
      // the raw socket would otherwise drop them.
      ...(res.getHeaders() as Record<string, string>),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    });

    try {
      for await (const chunk of this.conversationsService.sendMessageStream(
        id,
        user.userId,
        user.organizationId,
        dto,
      )) {
        // SSE format: "data: <json>\n\n"
        res.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (err) {
      this.logger.error(`SSE stream error: ${err}`);
      const errorEvent = {
        type: 'error',
        error: err instanceof HttpException ? err.message : 'Something went wrong. Please try again.',
      };
      res.raw.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    } finally {
      res.raw.end();
    }
  }
}
