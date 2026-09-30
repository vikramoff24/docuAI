/**
 * SearchController — REST endpoints for document search.
 *
 * Endpoints:
 * - GET  /search         → Full-text, semantic, or hybrid search over documents
 * - GET  /search/suggest → Quick typeahead suggestions (name prefix match)
 *
 * All routes require authentication (JwtAuthGuard).
 * Results are always scoped to the user's current organization.
 *
 * ── QUERY PARAMETER DESIGN ────────────────────────────────────────────────
 * Using GET (not POST) because search is a read-only, idempotent operation.
 * GET allows results to be cached (CDN, browser, HTTP proxy).
 * Query params are validated via SearchQueryDto + class-validator pipe.
 *
 * Example:
 *   GET /search?q=invoice+processing&mode=hybrid&tags=finance&limit=10
 */

import {
  Controller,
  Get,
  Query,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /search
   *
   * Search for documents across the organization.
   *
   * Query parameters (validated via SearchQueryDto):
   * - q:        Required. Search query string
   * - mode:     Optional. 'fulltext' | 'semantic' | 'hybrid' (default: 'hybrid')
   * - folderId: Optional. Restrict to specific folder
   * - mimeType: Optional. Filter by MIME type prefix
   * - tags:     Optional. Filter by tags (can repeat: ?tags=finance&tags=invoice)
   * - limit:    Optional. Results per page (1-50, default: 10)
   * - offset:   Optional. Page offset (default: 0)
   *
   * Response:
   * {
   *   results: SearchResultItem[],
   *   total: number,       // Results in this page
   *   mode: string,        // Actual mode used
   *   query: string,       // Original query
   *   hasMore: boolean,    // Whether more pages exist
   *   took: number,        // Search time in ms
   * }
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async search(
    @CurrentUser() user: RequestUser,
    @Query() dto: SearchQueryDto,
  ) {
    this.logger.debug(
      `Search request: user=${user.userId} org=${user.organizationId} query="${dto.q}" mode=${dto.mode}`,
    );

    return this.searchService.search(user.organizationId, dto);
  }

  /**
   * GET /search/suggest
   *
   * Typeahead: returns document names matching a prefix query.
   * Used for autocomplete in the UI search bar.
   *
   * Fast path: ILIKE on name (trigram index) — no tsvector/embedding overhead.
   * Returns at most 8 suggestions.
   */
  @Get('suggest')
  @HttpCode(HttpStatus.OK)
  async suggest(
    @CurrentUser() user: RequestUser,
    @Query('q') q: string,
  ) {
    if (!q || q.trim().length < 2) {
      return { suggestions: [] };
    }

    const suggestions = await this.searchService.suggest(user.organizationId, q.trim());
    return { suggestions };
  }
}
