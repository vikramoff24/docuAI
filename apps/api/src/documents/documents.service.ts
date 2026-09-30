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
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { DocumentStatus } from '@prisma/client';

import { DatabaseService } from '../database/database.service';
import { StorageService } from './storage.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ListDocumentsDto } from './dto/list-documents.dto';
import { DOCUMENT_PROCESSING_QUEUE } from './documents.constants';

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
    const exists = await this.storage.objectExists(document.storageKey);
    if (!exists) {
      throw new BadRequestException(
        'File has not been uploaded to storage yet. Please upload the file first.',
      );
    }

    // Update status to PROCESSING
    const updated = await this.db.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.PROCESSING },
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
    await this.documentQueue.add('process-document', {
      documentId,
      organizationId,
      storageKey: updated.storageKey,
      mimeType: updated.mimeType,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });

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
      ...(query.folderId ? { folderId: query.folderId } : {}),
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

    // Only the creator or ADMIN/OWNER can delete
    // (Role check happens in the controller via RBAC guard)
    // Here we just allow the creator to delete their own docs
    if (document.createdById !== userId) {
      throw new ForbiddenException('You do not have permission to delete this document');
    }

    // Soft delete — preserve the record for audit trail
    await this.db.document.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Document ${documentId} soft-deleted by user ${userId}`);
  }
}
