/**
 * Document processing queue constants — shared between:
 * - apps/api/src/documents/documents.module.ts (producer)
 * - apps/worker/src/document-processing/ (consumer)
 *
 * The queue name must be identical on both sides.
 */
export const DOCUMENT_PROCESSING_QUEUE = 'document-processing';

/**
 * Job type names for the document processing queue.
 * Used when adding jobs (API side) and handling them (worker side).
 */
export const DocumentProcessingJobs = {
  PROCESS_DOCUMENT: 'process-document',
} as const;
