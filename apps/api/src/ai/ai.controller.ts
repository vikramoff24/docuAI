/**
 * AIController — Standalone AI endpoints (summarization, etc.).
 *
 * Endpoints:
 * - POST /ai/documents/:id/summarize → Generate document summary (SSE stream)
 *
 * These endpoints are separate from ConversationsController because they
 * operate on individual documents rather than conversation threads.
 */

import {
  Controller,
  Post,
  Param,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  Res,
  ParseUUIDPipe,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { RAGService } from './rag.service';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AIController {
  private readonly logger = new Logger(AIController.name);

  constructor(private readonly ragService: RAGService) {}

  /**
   * POST /ai/documents/:id/summarize
   *
   * Generate a summary of a document using the document's text chunks.
   * Returns JSON (not streaming) since summaries are typically short.
   *
   * Response:
   * {
   *   summary: string,      // 2-3 sentence summary
   *   keyPoints: string[],  // 3-5 bullet points
   *   wordCount: number,    // Approximate word count of the document
   * }
   */
  @Post('documents/:id/summarize')
  @HttpCode(HttpStatus.OK)
  async summarizeDocument(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) documentId: string,
  ) {
    if (!this.ragService.isAvailable()) {
      throw new ServiceUnavailableException(
        'AI service unavailable: OPENAI_API_KEY not configured',
      );
    }

    this.logger.log(
      `Summarizing document ${documentId} for org ${user.organizationId}`,
    );

    return this.ragService.summarizeDocument(documentId, user.organizationId);
  }
}
