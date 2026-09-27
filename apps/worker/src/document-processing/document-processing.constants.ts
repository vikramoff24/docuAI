/**
 * Document processing queue name constant.
 * Used by both the worker consumer and any producer (API service).
 */
export const DOCUMENT_PROCESSING_QUEUE = 'document-processing';

/**
 * Job type names for the document processing queue.
 */
export const DocumentProcessingJobs = {
  PROCESS_DOCUMENT: 'process-document',
  EXTRACT_TEXT: 'extract-text',
  CHUNK_TEXT: 'chunk-text',
  GENERATE_EMBEDDINGS: 'generate-embeddings',
} as const;

export type DocumentProcessingJobType =
  (typeof DocumentProcessingJobs)[keyof typeof DocumentProcessingJobs];
