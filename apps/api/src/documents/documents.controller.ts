/**
 * DocumentsController — HTTP endpoints for document management
 *
 * Routes:
 *   POST   /api/v1/documents/upload-url       → Get presigned S3 upload URL
 *   POST   /api/v1/documents/:id/confirm      → Confirm upload complete, queue processing
 *   GET    /api/v1/documents                  → List documents (paginated)
 *   GET    /api/v1/documents/:id              → Get document metadata
 *   GET    /api/v1/documents/:id/download     → Get presigned download URL
 *   DELETE /api/v1/documents/:id              → Soft delete document
 *
 * All routes require JWT authentication; writes require MEMBER or higher.
 * organizationId comes from the JWT — never from request body/params.
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ListDocumentsDto } from './dto/list-documents.dto';
import { MoveDocumentDto } from './dto/move-document.dto';
import { OrganizationMemberRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('documents')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // ──────────────────────────────────────────────────
  // POST /documents/upload-url
  // ──────────────────────────────────────────────────

  @Post('upload-url')
  @HttpCode(HttpStatus.CREATED)
  @Roles(OrganizationMemberRole.MEMBER)
  @ApiOperation({
    summary: 'Get a presigned S3 URL for direct upload',
    description: `
      Two-phase upload:
      1. POST /documents/upload-url → get uploadUrl + documentId
      2. PUT \${uploadUrl} with file binary (directly to S3)
      3. POST /documents/:id/confirm → mark document ready for processing
    `,
  })
  @ApiResponse({ status: 201, description: 'Upload URL generated' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async getUploadUrl(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.documentsService.getUploadUrl(
      user.organizationId,
      user.userId,
      dto,
    );
  }

  // ──────────────────────────────────────────────────
  // POST /documents/:id/confirm
  // ──────────────────────────────────────────────────

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @Roles(OrganizationMemberRole.MEMBER)
  @ApiOperation({
    summary: 'Confirm upload complete and trigger processing',
    description: 'Call after successfully uploading file to S3 using the presigned URL',
  })
  @ApiResponse({ status: 200, description: 'Upload confirmed, processing started' })
  @ApiResponse({ status: 400, description: 'File not found in storage' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async confirmUpload(
    @CurrentUser() user: RequestUser,
    @Param('id') documentId: string,
  ) {
    return this.documentsService.confirmUpload(
      documentId,
      user.organizationId,
      user.userId,
    );
  }

  // ──────────────────────────────────────────────────
  // GET /documents
  // ──────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List documents in the organization' })
  @ApiResponse({ status: 200, description: 'Paginated document list' })
  async listDocuments(
    @CurrentUser() user: RequestUser,
    @Query() query: ListDocumentsDto,
  ) {
    return this.documentsService.listDocuments(user.organizationId, query);
  }

  // ──────────────────────────────────────────────────
  // Search-index health (declared before the ':id' routes)
  // ──────────────────────────────────────────────────

  @Get('index-status')
  @ApiOperation({ summary: 'How many documents need reindexing (e.g. uploaded before an AI key was set)' })
  async getIndexStatus(@CurrentUser() user: RequestUser) {
    return this.documentsService.getIndexStatus(user.organizationId);
  }

  @Post('reindex')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(OrganizationMemberRole.ADMIN)
  @ApiOperation({ summary: 'Queue every document with an incomplete search index for processing (ADMIN+)' })
  async reindex(@CurrentUser() user: RequestUser) {
    return this.documentsService.reindexOrganization(user.organizationId, user.userId);
  }

  // ──────────────────────────────────────────────────
  // GET /documents/:id
  // ──────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get document metadata' })
  @ApiResponse({ status: 200, description: 'Document details' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getDocument(
    @CurrentUser() user: RequestUser,
    @Param('id') documentId: string,
  ) {
    return this.documentsService.getDocument(documentId, user.organizationId);
  }

  // ──────────────────────────────────────────────────
  // GET /documents/:id/download
  // ──────────────────────────────────────────────────

  @Get(':id/download')
  @ApiOperation({ summary: 'Get a presigned download URL for the document' })
  @ApiResponse({ status: 200, description: 'Presigned download URL (valid 1 hour)' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getDownloadUrl(
    @CurrentUser() user: RequestUser,
    @Param('id') documentId: string,
  ) {
    return this.documentsService.getDownloadUrl(documentId, user.organizationId);
  }

  // ──────────────────────────────────────────────────
  // PATCH /documents/:id — move between folders
  // ──────────────────────────────────────────────────

  @Patch(':id')
  @Roles(OrganizationMemberRole.MEMBER)
  @ApiOperation({ summary: 'Move a document to a folder (or out of folders with folderId: null)' })
  async moveDocument(
    @CurrentUser() user: RequestUser,
    @Param('id') documentId: string,
    @Body() dto: MoveDocumentDto,
  ) {
    return this.documentsService.moveDocument(documentId, user.organizationId, dto.folderId, user);
  }

  // ──────────────────────────────────────────────────
  // POST /documents/:id/reprocess
  // ──────────────────────────────────────────────────

  @Post(':id/reprocess')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(OrganizationMemberRole.MEMBER)
  @ApiOperation({ summary: 'Run text extraction and indexing again for a READY or FAILED document' })
  async reprocess(
    @CurrentUser() user: RequestUser,
    @Param('id') documentId: string,
  ) {
    return this.documentsService.reprocessDocument(documentId, user.organizationId, user);
  }

  // ──────────────────────────────────────────────────
  // DELETE /documents/:id
  // ──────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(OrganizationMemberRole.MEMBER)
  @ApiOperation({ summary: 'Soft delete a document' })
  @ApiResponse({ status: 204, description: 'Document deleted' })
  @ApiResponse({ status: 403, description: 'Not authorized to delete this document' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async deleteDocument(
    @CurrentUser() user: RequestUser,
    @Param('id') documentId: string,
  ) {
    await this.documentsService.deleteDocument(
      documentId,
      user.organizationId,
      user.userId,
      user.role,
    );
  }
}
