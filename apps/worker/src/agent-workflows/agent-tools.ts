/**
 * Agent tools — functions the LLM may call while executing a workflow.
 *
 * Every tool is scoped to the workflow's organization: the organizationId is
 * bound by the worker, never taken from LLM-supplied arguments, so a model
 * cannot reach another tenant's documents no matter what it asks for.
 */

import { Prisma } from '@prisma/client';
import { ToolDefinition } from '@docuflow/ai';

import { WorkerDatabaseService } from '../database/worker-database.service';

const MAX_SEARCH_RESULTS = 10;
const MAX_READ_CHUNKS = 20; // ~20k chars at 1000-char chunks
const MAX_METADATA_KEYS = 20;
const MAX_METADATA_BYTES = 4096;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;

/**
 * Prompt-injection defense: document text is attacker-controlled, so it is
 * returned inside explicit delimiters that the system prompt tells the model
 * to treat as data. Any delimiter-lookalikes inside the content are stripped
 * so a document cannot "close" the block early.
 */
export const UNTRUSTED_OPEN = '<untrusted_document_content>';
export const UNTRUSTED_CLOSE = '</untrusted_document_content>';

function fenceUntrusted(text: string): string {
  const cleaned = text.replace(/<\/?untrusted_document_content>/gi, '');
  return `${UNTRUSTED_OPEN}\n${cleaned}\n${UNTRUSTED_CLOSE}`;
}

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'searchDocuments',
    description:
      'Search documents in the organization by name, description, tags or text content. ' +
      'Returns up to 10 documents with id, name, tags and metadata.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (empty string lists recent documents)' },
        mimeType: { type: 'string', description: 'Optional exact MIME type filter' },
      },
      required: ['query'],
    },
  },
  {
    name: 'readDocument',
    description: 'Read the extracted text content of a document by its id.',
    parameters: {
      type: 'object',
      properties: {
        documentId: { type: 'string' },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'updateDocumentMetadata',
    description:
      'Shallow-merge a JSON object into a document\'s metadata, and optionally add tags.',
    parameters: {
      type: 'object',
      properties: {
        documentId: { type: 'string' },
        metadata: { type: 'object', description: 'JSON object to merge into metadata' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to add' },
      },
      required: ['documentId', 'metadata'],
    },
  },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export class AgentToolExecutor {
  /** Documents whose metadata was changed during this run (for the workflow output). */
  readonly updatedDocumentIds = new Set<string>();

  constructor(
    private readonly db: WorkerDatabaseService,
    private readonly organizationId: string,
    /** Workflow creator — agent writes are audited on their behalf. */
    private readonly actorUserId: string,
    private readonly workflowId: string,
  ) {}

  /** Executes a tool call and returns the string fed back to the model. Never throws. */
  async execute(name: string, rawArgs: string): Promise<string> {
    let args: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawArgs || '{}');
      if (!isPlainObject(parsed)) throw new Error('arguments must be a JSON object');
      args = parsed;
    } catch (e) {
      return JSON.stringify({ error: `Invalid arguments: ${(e as Error).message}` });
    }

    try {
      switch (name) {
        case 'searchDocuments':
          return JSON.stringify(await this.searchDocuments(args));
        case 'readDocument':
          return await this.readDocument(args);
        case 'updateDocumentMetadata':
          return JSON.stringify(await this.updateDocumentMetadata(args));
        default:
          return JSON.stringify({ error: `Unknown tool: ${name}` });
      }
    } catch (e) {
      return JSON.stringify({ error: (e as Error).message });
    }
  }

  private async searchDocuments(args: Record<string, unknown>) {
    const query = typeof args['query'] === 'string' ? args['query'].trim() : '';
    const mimeType = typeof args['mimeType'] === 'string' ? args['mimeType'] : undefined;

    const where: Prisma.DocumentWhereInput = {
      organizationId: this.organizationId,
      deletedAt: null,
      ...(mimeType ? { mimeType } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { tags: { has: query.toLowerCase() } },
              { chunks: { some: { content: { contains: query, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    return this.db.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX_SEARCH_RESULTS,
      select: { id: true, name: true, mimeType: true, status: true, tags: true, metadata: true },
    });
  }

  private async readDocument(args: Record<string, unknown>) {
    const doc = await this.findOwnedDocument(args['documentId']);
    if (!doc) return JSON.stringify({ error: 'Document not found' });

    const chunks = await this.db.documentChunk.findMany({
      where: { organizationId: this.organizationId, documentId: doc.id },
      orderBy: { chunkIndex: 'asc' },
      take: MAX_READ_CHUNKS,
      select: { content: true },
    });
    const text = chunks.map((c) => c.content).join('\n');
    if (!text) return 'No text content available for this document.';
    return fenceUntrusted(text);
  }

  private async updateDocumentMetadata(args: Record<string, unknown>) {
    const doc = await this.findOwnedDocument(args['documentId']);
    if (!doc) return { error: 'Document not found' };

    const patch = args['metadata'];
    if (!isPlainObject(patch)) return { error: 'metadata must be a JSON object' };
    if (Object.keys(patch).length > MAX_METADATA_KEYS) {
      return { error: `metadata may contain at most ${MAX_METADATA_KEYS} keys` };
    }
    if (JSON.stringify(patch).length > MAX_METADATA_BYTES) {
      return { error: `metadata must be at most ${MAX_METADATA_BYTES} bytes` };
    }

    const newTags = Array.isArray(args['tags'])
      ? args['tags']
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length > 0 && t.length <= MAX_TAG_LENGTH)
      : [];

    const current = isPlainObject(doc.metadata) ? doc.metadata : {};
    const metadata = { ...current, ...patch } as Prisma.InputJsonValue;
    const tags = Array.from(new Set([...doc.tags, ...newTags]));
    if (tags.length > MAX_TAGS) {
      return { error: `a document may have at most ${MAX_TAGS} tags` };
    }

    await this.db.$transaction([
      this.db.document.update({
        where: { id: doc.id },
        data: { metadata, tags },
      }),
      this.db.auditLog.create({
        data: {
          organizationId: this.organizationId,
          userId: this.actorUserId,
          action: 'AI_AGENT_ACTION',
          resourceType: 'document',
          resourceId: doc.id,
          metadata: {
            tool: 'updateDocumentMetadata',
            workflowId: this.workflowId,
            before: { metadata: doc.metadata, tags: doc.tags },
            after: { metadata, tags },
          } as Prisma.InputJsonValue,
        },
      }),
    ]);
    this.updatedDocumentIds.add(doc.id);

    return { success: true, documentId: doc.id, metadata, tags };
  }

  private async findOwnedDocument(documentId: unknown) {
    if (typeof documentId !== 'string' || !UUID_RE.test(documentId)) return null;
    return this.db.document.findFirst({
      where: { id: documentId, organizationId: this.organizationId, deletedAt: null },
      select: { id: true, metadata: true, tags: true },
    });
  }
}
