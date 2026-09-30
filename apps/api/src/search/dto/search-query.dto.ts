/**
 * SearchQueryDto — Validates and types all search query parameters.
 *
 * Supports three search modes:
 * - FULLTEXT: PostgreSQL tsvector full-text search (fast keyword matching)
 * - SEMANTIC: pgvector cosine similarity search (meaning-based)
 * - HYBRID:   RRF (Reciprocal Rank Fusion) of both (best quality)
 *
 * Design: All fields are optional — the endpoint supports
 * both simple queries ("find invoices") and complex filtered searches.
 */

import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsInt,
  Min,
  Max,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum SearchMode {
  FULLTEXT = 'fulltext',
  SEMANTIC = 'semantic',
  HYBRID = 'hybrid',
}

export class SearchQueryDto {
  /**
   * The search query string.
   * Required for fulltext and hybrid modes.
   * Used for embedding generation in semantic mode.
   */
  @IsString()
  q: string;

  /**
   * Search mode:
   * - fulltext: Fast keyword search using PostgreSQL tsvector
   * - semantic: Vector similarity search using OpenAI embeddings
   * - hybrid:   Combines both using Reciprocal Rank Fusion (default)
   */
  @IsOptional()
  @IsEnum(SearchMode)
  mode?: SearchMode = SearchMode.HYBRID;

  /**
   * Filter results to a specific folder (by ID).
   * Documents in subfolders are NOT included (exact folder match only).
   */
  @IsOptional()
  @IsUUID()
  folderId?: string;

  /**
   * Filter by document MIME type prefix.
   * Examples: 'application/pdf', 'text/', 'application/vnd.openxmlformats'
   */
  @IsOptional()
  @IsString()
  mimeType?: string;

  /**
   * Filter documents that have ALL of the specified tags (AND logic).
   * Example: ['invoice', 'finance'] → only docs with both tags
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  @Transform(({ value }) =>
    typeof value === 'string' ? [value] : value,
  )
  tags?: string[];

  /**
   * Number of results per page (default: 10, max: 50).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 10;

  /**
   * Page offset for pagination (0-indexed).
   * Use limit + offset for cursor-less pagination.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  offset?: number = 0;
}
