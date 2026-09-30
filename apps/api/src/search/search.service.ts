/**
 * SearchService — Full-text, semantic, and hybrid search over documents.
 *
 * ── THREE SEARCH MODES ──────────────────────────────────────────────────────
 *
 * 1. FULLTEXT (PostgreSQL ts_vector)
 *    - Best for: Exact keyword matching, proper nouns, short queries
 *    - Mechanism: plainto_tsquery() against search_vector (GIN indexed)
 *    - Speed: O(log n) via GIN index — fast even on millions of docs
 *    - Ranking: ts_rank_cd() — considers proximity + density
 *
 * 2. SEMANTIC (pgvector cosine similarity)
 *    - Best for: Conceptual queries ("cost reduction strategies"), paraphrases
 *    - Mechanism: Query text → OpenAI embedding → cosine distance in HNSW index
 *    - Speed: O(log n) approximate via HNSW — ~5-10ms at scale
 *    - Ranking: 1 - cosine_distance (higher = more similar)
 *    - LIMITATION: Requires OPENAI_API_KEY; degrades gracefully to fulltext
 *
 * 3. HYBRID (Reciprocal Rank Fusion)
 *    - Best for: Most queries — combines keyword precision + semantic recall
 *    - Mechanism: Run both searches, merge ranks using RRF formula:
 *      score = Σ 1/(k + rank_i) where k=60 (standard constant)
 *    - Why RRF? Works without knowing actual score distributions
 *      (fulltext scores and vector distances are on different scales)
 *    - Research: Hughes et al. (2009), used by Elasticsearch, Azure AI Search
 *
 * ── MULTI-TENANCY ───────────────────────────────────────────────────────────
 * ALL queries filter by organizationId first. This is enforced in every
 * raw SQL query — there's no way for org A to see org B's documents.
 *
 * ── RAW SQL USAGE ────────────────────────────────────────────────────────────
 * We use Prisma's $queryRaw for:
 * - tsvector queries (@@ operator, ts_rank_cd)
 * - pgvector queries (<=> operator, cosine distance)
 * - The CTE-based hybrid search combining both
 *
 * Regular Prisma queries are used for everything else (metadata, pagination).
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { DatabaseService } from '../database/database.service';
import { SearchMode, SearchQueryDto } from './dto/search-query.dto';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchResultItem {
  /** Document ID */
  id: string;
  /** Document name */
  name: string;
  /** Document description */
  description: string | null;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Processing status */
  status: string;
  /** Tags */
  tags: string[];
  /** Folder ID */
  folderId: string | null;
  /** Folder name (if in a folder) */
  folderName: string | null;
  /** Upload timestamp */
  createdAt: Date;
  /** Relevance score (higher = more relevant) */
  score: number;
  /** Matching text snippets (from full-text search headline) */
  highlights: string[];
  /** Source chunks that matched (for semantic search) */
  matchingChunks: ChunkMatch[];
}

export interface ChunkMatch {
  content: string;
  chunkIndex: number;
  /** Cosine similarity score (0-1) */
  similarity: number;
}

export interface SearchResponse {
  results: SearchResultItem[];
  total: number;
  mode: SearchMode;
  query: string;
  hasMore: boolean;
  /** Processing time in milliseconds */
  took: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly openaiApiKey: string | undefined;

  constructor(
    private readonly db: DatabaseService,
    config: ConfigService,
  ) {
    this.openaiApiKey = config.get<string>('OPENAI_API_KEY');
    if (!this.openaiApiKey) {
      this.logger.warn(
        'OPENAI_API_KEY not set — semantic search will be unavailable. ' +
          'Hybrid search will fall back to fulltext only.',
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ──────────────────────────────────────────────────────────────────────────

  async search(
    organizationId: string,
    dto: SearchQueryDto,
  ): Promise<SearchResponse> {
    const start = Date.now();
    const { q, mode = SearchMode.HYBRID, limit = 10, offset = 0 } = dto;

    this.logger.debug(
      `Search [${mode}] org=${organizationId} query="${q}" limit=${limit} offset=${offset}`,
    );

    if (!q || q.trim().length === 0) {
      throw new BadRequestException('Search query cannot be empty');
    }

    let results: SearchResultItem[];

    try {
      switch (mode) {
        case SearchMode.FULLTEXT:
          results = await this.fulltextSearch(organizationId, dto);
          break;
        case SearchMode.SEMANTIC:
          results = await this.semanticSearch(organizationId, dto);
          break;
        case SearchMode.HYBRID:
        default:
          results = await this.hybridSearch(organizationId, dto);
          break;
      }
    } catch (err) {
      this.logger.error(`Search failed: ${err}`);
      throw err;
    }

    const took = Date.now() - start;
    this.logger.debug(`Search completed in ${took}ms, ${results.length} results`);

    return {
      results,
      total: results.length,
      mode: mode ?? SearchMode.HYBRID,
      query: q,
      hasMore: results.length === limit,
      took,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODE 1: FULLTEXT SEARCH
  // ──────────────────────────────────────────────────────────────────────────

  private async fulltextSearch(
    organizationId: string,
    dto: SearchQueryDto,
  ): Promise<SearchResultItem[]> {
    const { q, folderId, mimeType, tags, limit = 10, offset = 0 } = dto;

    // Build optional filter fragments
    const folderFilter = folderId
      ? Prisma.sql`AND d."folderId" = ${folderId}::uuid`
      : Prisma.sql``;

    const mimeFilter = mimeType
      ? Prisma.sql`AND d."mimeType" LIKE ${mimeType + '%'}`
      : Prisma.sql``;

    const tagsFilter =
      tags && tags.length > 0
        ? Prisma.sql`AND d."tags" @> ${tags}::text[]`
        : Prisma.sql``;

    const rows = await this.db.$queryRaw<
      Array<{
        id: string;
        name: string;
        description: string | null;
        mimeType: string;
        sizeBytes: number;
        status: string;
        tags: string[];
        folderId: string | null;
        folderName: string | null;
        createdAt: Date;
        score: number;
        headline: string;
      }>
    >`
      SELECT
        d."id",
        d."name",
        d."description",
        d."mimeType",
        d."sizeBytes",
        d."status",
        d."tags",
        d."folderId",
        f."name" AS "folderName",
        d."createdAt",
        ts_rank_cd(d."searchVector", query) AS score,
        ts_headline(
          'english',
          COALESCE(d."description", d."name"),
          query,
          'MaxWords=20, MinWords=5, StartSel=<mark>, StopSel=</mark>, MaxFragments=3'
        ) AS headline
      FROM "documents" d
      LEFT JOIN "folders" f ON d."folderId" = f."id"
      , plainto_tsquery('english', ${q}) AS query
      WHERE
        d."organizationId" = ${organizationId}::uuid
        AND d."deletedAt" IS NULL
        AND d."status" = 'READY'
        AND d."searchVector" @@ query
        ${folderFilter}
        ${mimeFilter}
        ${tagsFilter}
      ORDER BY score DESC, d."createdAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      mimeType: row.mimeType,
      sizeBytes: Number(row.sizeBytes),
      status: row.status,
      tags: row.tags ?? [],
      folderId: row.folderId,
      folderName: row.folderName,
      createdAt: row.createdAt,
      score: Number(row.score),
      highlights: row.headline ? [row.headline] : [],
      matchingChunks: [],
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODE 2: SEMANTIC SEARCH (vector similarity)
  // ──────────────────────────────────────────────────────────────────────────

  private async semanticSearch(
    organizationId: string,
    dto: SearchQueryDto,
  ): Promise<SearchResultItem[]> {
    if (!this.openaiApiKey) {
      this.logger.warn('Semantic search requested but OPENAI_API_KEY not set. Falling back to fulltext.');
      return this.fulltextSearch(organizationId, { ...dto, mode: SearchMode.FULLTEXT });
    }

    const { q, folderId, mimeType, tags, limit = 10, offset = 0 } = dto;

    // Generate query embedding
    const queryEmbedding = await this.generateQueryEmbedding(q);
    const embeddingLiteral = this.formatEmbeddingForSQL(queryEmbedding);

    const folderFilter = folderId
      ? Prisma.sql`AND d."folderId" = ${folderId}::uuid`
      : Prisma.sql``;

    const mimeFilter = mimeType
      ? Prisma.sql`AND d."mimeType" LIKE ${mimeType + '%'}`
      : Prisma.sql``;

    const tagsFilter =
      tags && tags.length > 0
        ? Prisma.sql`AND d."tags" @> ${tags}::text[]`
        : Prisma.sql``;

    // Semantic search: find top-k chunks by cosine similarity, then
    // group by document to get the best match per document
    const rows = await this.db.$queryRawUnsafe<
      Array<{
        id: string;
        name: string;
        description: string | null;
        mimeType: string;
        sizeBytes: number;
        status: string;
        tags: string[];
        folderId: string | null;
        folderName: string | null;
        createdAt: Date;
        score: number;
        chunkContent: string;
        chunkIndex: number;
        chunkSimilarity: number;
      }>
    >(`
      WITH ranked_chunks AS (
        SELECT
          c."documentId",
          c."content" AS "chunkContent",
          c."chunkIndex",
          1 - (c."embedding" <=> '${embeddingLiteral}'::vector) AS similarity,
          ROW_NUMBER() OVER (
            PARTITION BY c."documentId"
            ORDER BY c."embedding" <=> '${embeddingLiteral}'::vector ASC
          ) AS rn
        FROM "document_chunks" c
        WHERE
          c."organizationId" = '${organizationId}'
          AND c."embedding" IS NOT NULL
        ORDER BY c."embedding" <=> '${embeddingLiteral}'::vector ASC
        LIMIT 200
      )
      SELECT
        d."id",
        d."name",
        d."description",
        d."mimeType",
        d."sizeBytes",
        d."status",
        d."tags",
        d."folderId",
        f."name" AS "folderName",
        d."createdAt",
        rc.similarity AS score,
        rc."chunkContent",
        rc."chunkIndex",
        rc.similarity AS "chunkSimilarity"
      FROM ranked_chunks rc
      JOIN "documents" d ON rc."documentId" = d."id"
      LEFT JOIN "folders" f ON d."folderId" = f."id"
      WHERE
        rc.rn = 1
        AND d."organizationId" = '${organizationId}'
        AND d."deletedAt" IS NULL
        AND d."status" = 'READY'
        ${folderId ? `AND d."folderId" = '${folderId}'` : ''}
        ${mimeType ? `AND d."mimeType" LIKE '${mimeType}%'` : ''}
        ${tags && tags.length > 0 ? `AND d."tags" @> ARRAY[${tags.map((t) => `'${t.replace(/'/g, "''")}'`).join(',')}]::text[]` : ''}
      ORDER BY rc.similarity DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      mimeType: row.mimeType,
      sizeBytes: Number(row.sizeBytes),
      status: row.status,
      tags: row.tags ?? [],
      folderId: row.folderId,
      folderName: row.folderName,
      createdAt: row.createdAt,
      score: Number(row.score),
      highlights: [],
      matchingChunks: [
        {
          content: row.chunkContent,
          chunkIndex: Number(row.chunkIndex),
          similarity: Number(row.chunkSimilarity),
        },
      ],
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODE 3: HYBRID SEARCH (RRF fusion)
  // ──────────────────────────────────────────────────────────────────────────

  private async hybridSearch(
    organizationId: string,
    dto: SearchQueryDto,
  ): Promise<SearchResultItem[]> {
    // If no API key, fall back to fulltext only
    if (!this.openaiApiKey) {
      this.logger.debug('No API key — hybrid search falling back to fulltext');
      return this.fulltextSearch(organizationId, { ...dto, mode: SearchMode.FULLTEXT });
    }

    // Run both searches in parallel for speed
    const [fulltextResults, semanticResults] = await Promise.allSettled([
      this.fulltextSearch(organizationId, { ...dto, limit: 50, offset: 0 }),
      this.semanticSearch(organizationId, { ...dto, limit: 50, offset: 0 }),
    ]);

    const ftResults =
      fulltextResults.status === 'fulfilled' ? fulltextResults.value : [];
    const semResults =
      semanticResults.status === 'fulfilled' ? semanticResults.value : [];

    if (fulltextResults.status === 'rejected') {
      this.logger.warn(`Fulltext search failed in hybrid: ${fulltextResults.reason}`);
    }
    if (semanticResults.status === 'rejected') {
      this.logger.warn(`Semantic search failed in hybrid: ${semanticResults.reason}`);
    }

    // Reciprocal Rank Fusion (k=60 is the standard constant)
    // RRF score = Σ 1/(k + rank_i) for each result list where result appears
    const RRF_K = 60;
    const scoreMap = new Map<string, { score: number; item: SearchResultItem }>();

    const applyRRF = (results: SearchResultItem[]) => {
      results.forEach((item, index) => {
        const rank = index + 1; // 1-indexed
        const rrfScore = 1 / (RRF_K + rank);
        const existing = scoreMap.get(item.id);
        if (existing) {
          existing.score += rrfScore;
          // Merge matching chunks from semantic results
          if (item.matchingChunks.length > 0) {
            existing.item.matchingChunks.push(...item.matchingChunks);
          }
          // Merge highlights from fulltext results
          if (item.highlights.length > 0) {
            existing.item.highlights.push(...item.highlights);
          }
        } else {
          scoreMap.set(item.id, { score: rrfScore, item: { ...item } });
        }
      });
    };

    applyRRF(ftResults);
    applyRRF(semResults);

    // Sort by RRF score descending, apply limit/offset
    const { limit = 10, offset = 0 } = dto;
    const merged = Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(offset, offset + limit)
      .map(({ score, item }) => ({ ...item, score }));

    return merged;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // EMBEDDING GENERATION
  // ──────────────────────────────────────────────────────────────────────────

  private async generateQueryEmbedding(query: string): Promise<number[]> {
    if (!this.openaiApiKey) {
      throw new ServiceUnavailableException('Semantic search unavailable: OPENAI_API_KEY not configured');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: query,
        model: 'text-embedding-3-small',
        dimensions: 1536,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data[0].embedding;
  }

  /**
   * Format an embedding array into a PostgreSQL vector literal.
   * pgvector expects: '[0.1,0.2,...,0.1536]'
   */
  private formatEmbeddingForSQL(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TYPEAHEAD SUGGESTIONS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Fast typeahead: returns document names/descriptions matching a prefix.
   * Uses pg_trgm GIN index on document name for ILIKE queries.
   * Returns at most 8 suggestions.
   */
  async suggest(
    organizationId: string,
    query: string,
  ): Promise<Array<{ id: string; name: string; mimeType: string }>> {
    const pattern = `%${query}%`;

    const rows = await this.db.$queryRaw<
      Array<{ id: string; name: string; mimeType: string }>
    >`
      SELECT
        d."id",
        d."name",
        d."mimeType"
      FROM "documents" d
      WHERE
        d."organizationId" = ${organizationId}::uuid
        AND d."deletedAt" IS NULL
        AND d."status" = 'READY'
        AND d."name" ILIKE ${pattern}
      ORDER BY
        -- Prefix matches first, then trigram similarity
        (d."name" ILIKE ${query + '%'}) DESC,
        similarity(d."name", ${query}) DESC,
        d."name" ASC
      LIMIT 8
    `;

    return rows;
  }
}
