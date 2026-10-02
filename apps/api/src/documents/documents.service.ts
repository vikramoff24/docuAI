/**
 * DocumentsService — Business logic for document management
 *
 * ────────────────────────────────────────────────────────
 * UPLOAD FLOW (2-phase commit pattern)
 * ────────────────────────────────────────────────────────
 *
 * Phase 1 — Get upload URL:
 *   POST /documents/upload-url
 *   → Creates a Document record with status=PENDING
 *   → Generates a presigned S3 PUT URL
 *   → Client uploads directly to S3
 *
 * Phase 2 — Confirm upload:
 *   POST /documents/:id/confirm
 *   → Verifies file actually exists in S3
 *   → Sets status=PROCESSING
 *   → Queues BullMQ processing job
 *
 * WHY TWO PHASES?
 * If we created the DB record AFTER the S3 upload, we'd have
 * no way to recover if the client dies between upload and confirm.
 * Creating BEFORE means we can find orphaned PENDING records and
 * clean them up (scheduled cleanup job in Phase 3).
 *
 * ────────────────────────────────────────────────────────
 * MULTI-TENANCY
 * ────────────────────────────────────────────────────────
 * organizationId ALWAYS comes from the JWT, never from the client.
 * All queries ALWAYS include organizationId in the WHERE clause.
 * This is the tenant isolation guarantee.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { DocumentStatus, OrganizationMemberRole, Prisma } from '@prisma/client';

import { DatabaseService } from '../database/database.service';
import { StorageService } from './storage.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ListDocumentsDto } from './dto/list-documents.dto';
import { DOCUMENT_PROCESSING_QUEUE } from './documents.constants';
import { AiCredentialsService } from '../ai/ai-credentials.service';
import { isAdminRole } from '../common/roles';

/** Max documents queued by one "reindex" request; the UI can ask again for more. */
const REINDEX_BATCH = 500;

/**
 * READY documents whose search index is incomplete: chunks stored without an
 * embedding (uploaded before an AI key existed), or placeholder text left by
 * the pre-2026-10-01 PDF/DOCX extractor bug.
 */
const needsIndexingSql = (organizationId: string) => Prisma.sql`
  SELECT d."id" FROM "documents" d
  WHERE d."organizationId" = ${organizationId}::uuid
    AND d."deletedAt" IS NULL
    AND d."status" = 'READY'
    AND EXISTS (
      SELECT 1 FROM "document_chunks" c
      WHERE c."documentId" = d."id"
        AND (c."embedding" IS NULL
             OR c."content" LIKE '[PDF extraction failed:%'
             OR c."content" LIKE '[DOCX extraction failed:%')
    )`;

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// UUID v4 pattern — validate before passing to Prisma to avoid Prisma's inconsistent error
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    @InjectQueue(DOCUMENT_PROCESSING_QUEUE) private readonly documentQueue: Queue,
    private readonly aiCredentials: AiCredentialsService,
  ) {}

  // ──────────────────────────────────────────────────
  // GET UPLOAD URL (Phase 1 of 2-phase upload)
  // ──────────────────────────────────────────────────

  async getUploadUrl(
    organizationId: string,
    userId: string,
    dto: CreateDocumentDto,
  ) {
    // Validate file size (belt-and-suspenders — DTO validates too)
    if (dto.sizeBytes > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(dto.mimeType)) {
      throw new BadRequestException(`Unsupported file type: ${dto.mimeType}`);
    }

    // Validate folderId belongs to this org (if provided)
    if (dto.folderId) {
      const folder = await this.db.folder.findFirst({
        where: { id: dto.folderId, organizationId, deletedAt: null },
      });
      if (!folder) {
        throw new NotFoundException('Folder not found');
      }
    }

    // Create document record with PENDING status
    const document = await this.db.document.create({
      data: {
        organizationId,
        folderId: dto.folderId,
        name: dto.name,
        description: dto.description,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        storageKey: 'pending', // Will be set to real key after creation
        status: DocumentStatus.PENDING,
        tags: dto.tags ?? [],
        createdById: userId,
      },
      select: { id: true },
    });

    // Build the storage key using the document's UUID
    const storageKey = this.storage.buildDocumentKey(
      organizationId,
      document.id,
      dto.name,
    );

    // Update the storageKey now that we have the document ID
    await this.db.document.update({
      where: { id: document.id },
      data: { storageKey },
    });

    // Generate presigned upload URL
    const { uploadUrl, expiresIn } = await this.storage.generateUploadUrl(
      storageKey,
      dto.mimeType,
    );

    this.logger.log(`Upload URL generated for document ${document.id} in org ${organizationId}`);

    return {
      documentId: document.id,
      uploadUrl,
      storageKey,
      expiresIn,
    };
  }

  // ──────────────────────────────────────────────────
  // CONFIRM UPLOAD (Phase 2 of 2-phase upload)
  // ──────────────────────────────────────────────────

  async confirmUpload(
    documentId: string,
    organizationId: string,
    userId: string,
  ) {
    // Validate UUID format to avoid Prisma throwing inconsistent errors on malformed IDs
    if (!isValidUuid(documentId) || !isValidUuid(organizationId)) {
      throw new NotFoundException('Document not found');
    }

    const document = await this.db.document.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.createdById !== userId) {
      throw new ForbiddenException('Only the uploader can confirm this document');
    }

    if (document.status !== DocumentStatus.PENDING) {
      throw new BadRequestException(`Document is already in ${document.status} status`);
    }

    // Verify file actually exists in S3
    const actualSize = await this.storage.getObjectSize(document.storageKey);
    if (actualSize === null) {
      throw new BadRequestException(
        'File has not been uploaded to storage yet. Please upload the file first.',
      );
    }

    // The presigned PUT can't enforce a size, so check what actually arrived:
    // otherwise a client could declare 1 byte and store gigabytes.
    if (actualSize === 0 || actualSize > MAX_FILE_SIZE) {
      await this.storage.deleteObject(document.storageKey).catch(() => undefined);
      await this.db.document.update({
        where: { id: documentId },
        data: { deletedAt: new Date() },
      });
      throw new BadRequestException(
        actualSize === 0
          ? 'The uploaded file is empty'
          : `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    // Claim the PENDING → PROCESSING transition atomically, so a double-click
    // or retried request can't queue the same document twice.
    const { count } = await this.db.document.updateMany({
      where: { id: documentId, status: DocumentStatus.PENDING, deletedAt: null },
      data: { status: DocumentStatus.PROCESSING, sizeBytes: actualSize },
    });
    if (count === 0) {
      throw new BadRequestException('Document is already being processed');
    }

    const updated = await this.db.document.findUniqueOrThrow({
      where: { id: documentId },
      select: {
        id: true,
        name: true,
        status: true,
        mimeType: true,
        sizeBytes: true,
        storageKey: true,
      },
    });

    // Queue BullMQ job for text extraction, chunking, and embedding
    await this.enqueueProcessing(organizationId, updated);

    this.logger.log(`Document ${documentId} confirmed and queued for processing`);

    return updated;
  }

  // ──────────────────────────────────────────────────
  // LIST DOCUMENTS
  // ──────────────────────────────────────────────────

  async listDocuments(organizationId: string, query: ListDocumentsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      organizationId,
      deletedAt: null,
      // "root" = not in any folder (documents explicitly placed in the org's "/" folder count too)
      ...(query.folderId === 'root'
        ? { OR: [{ folderId: null }, { folder: { path: '/' } }] }
        : query.folderId
          ? { folderId: query.folderId }
          : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.db.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          mimeType: true,
          sizeBytes: true,
          status: true,
          processingError: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
          folder: { select: { id: true, name: true } },
          createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.db.document.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  // ──────────────────────────────────────────────────
  // GET DOCUMENT BY ID
  // ──────────────────────────────────────────────────

  async getDocument(documentId: string, organizationId: string) {
    // Validate UUID format
    if (!isValidUuid(documentId) || !isValidUuid(organizationId)) {
      throw new NotFoundException('Document not found');
    }

    const document = await this.db.document.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        processingError: true,
        tags: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        folder: { select: { id: true, name: true, path: true } },
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  // ──────────────────────────────────────────────────
  // GET DOWNLOAD URL
  // ──────────────────────────────────────────────────

  async getDownloadUrl(documentId: string, organizationId: string) {
    // Validate UUID format
    if (!isValidUuid(documentId) || !isValidUuid(organizationId)) {
      throw new NotFoundException('Document not found or not yet processed');
    }

    const document = await this.db.document.findFirst({
      where: {
        id: documentId,
        organizationId,
        deletedAt: null,
        status: { not: DocumentStatus.PENDING },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found or not yet processed');
    }

    const { downloadUrl, expiresIn } = await this.storage.generateDownloadUrl(
      document.storageKey,
    );

    return { downloadUrl, expiresIn };
  }

  // ──────────────────────────────────────────────────
  // SOFT DELETE
  // ──────────────────────────────────────────────────

  async deleteDocument(
    documentId: string,
    organizationId: string,
    userId: string,
    role: OrganizationMemberRole,
  ) {
    // Validate UUID format
    if (!isValidUuid(documentId) || !isValidUuid(organizationId)) {
      throw new NotFoundException('Document not found');
    }

    const document = await this.db.document.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // MEMBERs delete their own documents; ADMIN/OWNER can delete any document
    // (VIEWERs are stopped earlier by the RBAC guard)
    const isAdmin = role === OrganizationMemberRole.ADMIN || role === OrganizationMemberRole.OWNER;
    if (document.createdById !== userId && !isAdmin) {
      throw new ForbiddenException('You do not have permission to delete this document');
    }

    // Soft delete — preserve the record for audit trail
    await this.db.document.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Document ${documentId} soft-deleted by user ${userId}`);
  }

  // ──────────────────────────────────────────────────
  // MOVE (PATCH /documents/:id)
  // ──────────────────────────────────────────────────

  async moveDocument(
    documentId: string,
    organizationId: string,
    folderId: string | null,
    user: { userId: string; role: OrganizationMemberRole },
  ) {
    const document = await this.findManageableDocument(documentId, organizationId, user, 'move');

    let folder: { id: string; name: string; path: string } | null = null;
    if (folderId) {
      folder = await this.db.folder.findFirst({
        where: { id: folderId, organizationId, deletedAt: null },
        select: { id: true, name: true, path: true },
      });
      if (!folder) throw new NotFoundException('Folder not found');
    }
    // The org's "/" folder and "no folder" are the same place
    const targetFolderId = folder && folder.path !== '/' ? folder.id : null;

    if (document.folderId !== targetFolderId) {
      await this.db.$transaction([
        this.db.document.update({ where: { id: documentId }, data: { folderId: targetFolderId } }),
        this.db.auditLog.create({
          data: {
            organizationId,
            userId: user.userId,
            action: 'DOCUMENT_MOVED',
            resourceType: 'document',
            resourceId: documentId,
            metadata: { from: document.folderId, to: targetFolderId },
          },
        }),
      ]);
    }
    return this.getDocument(documentId, organizationId);
  }

  // ──────────────────────────────────────────────────
  // REPROCESS / REINDEX
  // ──────────────────────────────────────────────────

  /** Runs the processing pipeline again for one READY or FAILED document. */
  async reprocessDocument(
    documentId: string,
    organizationId: string,
    user: { userId: string; role: OrganizationMemberRole },
  ) {
    const document = await this.findManageableDocument(documentId, organizationId, user, 'reprocess');

    const { count } = await this.db.document.updateMany({
      where: {
        id: documentId,
        deletedAt: null,
        status: { in: [DocumentStatus.READY, DocumentStatus.FAILED] },
      },
      data: { status: DocumentStatus.PROCESSING, processingError: null },
    });
    if (count === 0) {
      throw new ConflictException(
        document.status === DocumentStatus.PENDING
          ? 'This upload was never completed — upload the file again'
          : 'This document is already being processed',
      );
    }

    await this.enqueueProcessing(organizationId, document);
    this.logger.log(`Document ${documentId} queued for reprocessing by ${user.userId}`);
    return { id: documentId, status: DocumentStatus.PROCESSING };
  }

  async getIndexStatus(organizationId: string) {
    const [row] = await this.db.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) AS count FROM (${needsIndexingSql(organizationId)}) pending`;
    return { needsIndexing: Number(row?.count ?? 0) };
  }

  /** Re-queues every document with an incomplete index (admin, needs an AI key). */
  async reindexOrganization(organizationId: string, userId: string) {
    const ai = await this.aiCredentials.providerFor(organizationId);
    if (!ai?.isAvailable()) {
      throw new ServiceUnavailableException(
        'Add an OpenAI API key in Settings first — reindexing creates AI embeddings',
      );
    }

    // Select + claim in one statement so a concurrent request can't queue the same documents
    const claimed = await this.db.$queryRaw<
      { id: string; name: string; mimeType: string; storageKey: string }[]
    >`
      UPDATE "documents"
      SET "status" = 'PROCESSING', "processingError" = NULL, "updatedAt" = NOW()
      WHERE "id" IN (${needsIndexingSql(organizationId)} LIMIT ${REINDEX_BATCH})
        AND "status" = 'READY'
      RETURNING "id", "name", "mimeType", "storageKey"`;

    for (const doc of claimed) {
      await this.enqueueProcessing(organizationId, doc);
    }
    if (claimed.length > 0) {
      await this.db.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'DOCUMENT_UPDATED',
          resourceType: 'organization',
          resourceId: organizationId,
          metadata: { operation: 'reindex', documents: claimed.length },
        },
      });
    }
    this.logger.log(`Reindex queued ${claimed.length} documents for org ${organizationId}`);
    return { queued: claimed.length };
  }

  // ──────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────

  private async enqueueProcessing(
    organizationId: string,
    doc: { id: string; name: string; mimeType: string; storageKey: string },
  ) {
    await this.documentQueue.add('process-document', {
      documentId: doc.id,
      organizationId,
      s3Key: doc.storageKey,                                   // Consumer expects s3Key
      mimeType: doc.mimeType,
      fileName: doc.storageKey.split('/').pop() ?? doc.name,   // Extract filename from S3 key
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  /** Same rule as delete: MEMBERs act on their own documents, ADMIN/OWNER on any. */
  private async findManageableDocument(
    documentId: string,
    organizationId: string,
    user: { userId: string; role: OrganizationMemberRole },
    action: string,
  ) {
    if (!isValidUuid(documentId)) throw new NotFoundException('Document not found');
    const document = await this.db.document.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
    });
    if (!document) throw new NotFoundException('Document not found');
    if (document.createdById !== user.userId && !isAdminRole(user.role)) {
      throw new ForbiddenException(`You do not have permission to ${action} this document`);
    }
    return document;
  }
}
