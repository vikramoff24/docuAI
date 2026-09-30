/**
 * SearchModule — Document search feature module.
 *
 * Provides:
 * - SearchController: GET /search, GET /search/suggest
 * - SearchService: fulltext + semantic + hybrid search implementation
 *
 * Dependencies:
 * - DatabaseModule (@Global) — Prisma client for raw SQL queries
 * - ConfigModule (@Global) — OPENAI_API_KEY for semantic search
 *
 * No additional imports needed because DatabaseModule and ConfigModule
 * are global — they're available to all feature modules.
 */

import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService], // Export for use in AI module (Phase 5)
})
export class SearchModule {}
