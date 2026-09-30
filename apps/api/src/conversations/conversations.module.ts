/**
 * ConversationsModule — AI-powered conversation and Q&A feature.
 *
 * Provides:
 * - ConversationsController: REST + SSE endpoints
 * - ConversationsService: CRUD + RAG-powered messaging
 *
 * Dependencies:
 * - RAGService: from AIModule (via @Global() export)
 * - DatabaseModule: @Global() Prisma client
 * - ConfigModule: @Global() for AI config
 *
 * AIModule is NOT imported here directly because it's @Global() —
 * its providers (AI_PROVIDER_TOKEN, RAGService) are available everywhere.
 * BUT RAGService is provided by AIModule, so we need to import AIModule.
 */

import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { AIModule } from '../ai/ai.module';
import { RAGService } from '../ai/rag.service';

@Module({
  imports: [AIModule], // For RAGService + AI_PROVIDER_TOKEN
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
