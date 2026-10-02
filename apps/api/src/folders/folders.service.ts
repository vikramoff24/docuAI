import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { DatabaseService } from '../database/database.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';

@Injectable()
export class FoldersService {
  private readonly logger = new Logger(FoldersService.name);

  constructor(private readonly db: DatabaseService) {}

  async createFolder(
    organizationId: string,
    userId: string,
    dto: CreateFolderDto,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.lockFolderTree(tx, organizationId);

      // If parentId provided, verify it belongs to the same org
      let parentPath = '/';
      let parentId: string | null = null;
      if (dto.parentId) {
        const parent = await tx.folder.findFirst({
          where: { id: dto.parentId, organizationId, deletedAt: null },
        });
        if (!parent) throw new NotFoundException('Parent folder not found');
        parentPath = parent.path;
        // The org's "/" folder and "top level" are the same place
        parentId = parent.path === '/' ? null : parent.id;
      }

      const path = this.childPath(parentPath, dto.name);
      await this.assertPathFree(tx, organizationId, path);

      const folder = await tx.folder.create({
        data: {
          organizationId,
          parentId,
          name: dto.name,
          path,
          createdById: userId,
        },
        select: {
          id: true,
          name: true,
          path: true,
          parentId: true,
          createdAt: true,
        },
      });

      this.logger.log(`Folder created: ${folder.path} in org ${organizationId}`);
      return folder;
    });
  }

  /**
   * Rename and/or move a folder. Its subtree moves with it: every descendant's
   * materialized path is rewritten in the same transaction.
   */
  async updateFolder(
    folderId: string,
    organizationId: string,
    userId: string,
    dto: UpdateFolderDto,
  ) {
    if (dto.name === undefined && dto.parentId === undefined) {
      throw new UnprocessableEntityException('Provide a new name and/or parentId');
    }

    const updated = await this.db.$transaction(async (tx) => {
      await this.lockFolderTree(tx, organizationId);

      const folder = await tx.folder.findFirst({
        where: { id: folderId, organizationId, deletedAt: null },
      });
      if (!folder) throw new NotFoundException('Folder not found');
      if (folder.path === '/') {
        throw new ConflictException('The root folder cannot be renamed or moved');
      }

      const name = dto.name ?? folder.name;
      let parentId = folder.parentId;
      let parentPath = folder.path.slice(0, folder.path.lastIndexOf('/')) || '/';

      if (dto.parentId !== undefined) {
        parentId = null;
        parentPath = '/';
        if (dto.parentId !== null) {
          const parent = await tx.folder.findFirst({
            where: { id: dto.parentId, organizationId, deletedAt: null },
          });
          if (!parent) throw new NotFoundException('Destination folder not found');
          if (parent.id === folder.id || parent.path.startsWith(`${folder.path}/`)) {
            throw new ConflictException('A folder cannot be moved into itself or one of its subfolders');
          }
          parentPath = parent.path;
          parentId = parent.path === '/' ? null : parent.id;
        }
      }

      const path = this.childPath(parentPath, name);
      const moved = parentId !== folder.parentId;
      if (path === folder.path && !moved && name === folder.name) return folder;

      if (path !== folder.path) {
        await this.assertPathFree(tx, organizationId, path, folder.id);
        // The folder and its whole subtree (soft-deleted rows included, so a
        // restore would land in the right place). substr is 1-based.
        await tx.$executeRaw`
          UPDATE folders
          SET path = ${path} || substr(path, ${folder.path.length + 1}::int), "updatedAt" = now()
          WHERE "organizationId" = ${organizationId}::uuid
            AND (path = ${folder.path} OR starts_with(path, ${folder.path + '/'}))
        `;
      }

      const result = await tx.folder.update({
        where: { id: folder.id },
        data: { name, parentId },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: moved ? 'FOLDER_MOVED' : 'FOLDER_UPDATED',
          resourceType: 'folder',
          resourceId: folder.id,
          metadata: { from: folder.path, to: path },
        },
      });
      return result;
    });

    this.logger.log(`Folder ${folderId} updated by user ${userId}: ${updated.path}`);
    return {
      id: updated.id,
      name: updated.name,
      path: updated.path,
      parentId: updated.parentId,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Serializes folder-tree changes within one organization (transaction-scoped
   * advisory lock). Without it, two concurrent requests could both pass the
   * duplicate-name check, or move two folders into each other and form a cycle.
   */
  private async lockFolderTree(tx: Prisma.TransactionClient, organizationId: string) {
    // $executeRaw: pg_advisory_xact_lock returns void, which $queryRaw can't deserialize
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'folders:' + organizationId}))`;
  }

  private childPath(parentPath: string, name: string) {
    return parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
  }

  /** Paths are unique among live folders (same name in the same parent). */
  private async assertPathFree(
    tx: Prisma.TransactionClient,
    organizationId: string,
    path: string,
    exceptId?: string,
  ) {
    const existing = await tx.folder.findFirst({
      where: { organizationId, path, deletedAt: null, ...(exceptId && { id: { not: exceptId } }) },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('A folder with this name already exists in this location');
    }
  }

  async listFolders(organizationId: string, parentId?: string) {
    return this.db.folder.findMany({
      where: {
        organizationId,
        parentId: parentId ?? null,
        deletedAt: null,
        // The org's root folder ("/") is "no folder" in the UI, never a listed child
        path: { not: '/' },
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        path: true,
        parentId: true,
        createdAt: true,
        _count: {
          select: {
            children: { where: { deletedAt: null } },
            documents: { where: { deletedAt: null } },
          },
        },
      },
    });
  }

  /** Every folder in the organization, by path — for "move to…" pickers. */
  async listAllFolders(organizationId: string) {
    return this.db.folder.findMany({
      where: { organizationId, deletedAt: null, path: { not: '/' } },
      orderBy: { path: 'asc' },
      take: 1000,
      select: { id: true, name: true, path: true, parentId: true },
    });
  }

  async deleteFolder(
    folderId: string,
    organizationId: string,
    userId: string,
  ) {
    await this.db.$transaction(async (tx) => {
      await this.lockFolderTree(tx, organizationId);

      const folder = await tx.folder.findFirst({
        where: { id: folderId, organizationId, deletedAt: null },
        include: {
          // Soft-deleted items don't make a folder "non-empty"
          _count: {
            select: {
              children: { where: { deletedAt: null } },
              documents: { where: { deletedAt: null } },
            },
          },
        },
      });

      if (!folder) throw new NotFoundException('Folder not found');

      // Don't delete the org's root folder (created at registration, path "/").
      // Other top-level folders also have parentId = null and are deletable.
      if (folder.path === '/') {
        throw new ConflictException('Cannot delete the root folder');
      }

      // Prevent deleting non-empty folders (simple safety check)
      if (folder._count.children > 0 || folder._count.documents > 0) {
        throw new ConflictException('Cannot delete a folder that contains items');
      }

      await tx.folder.update({
        where: { id: folderId },
        data: { deletedAt: new Date() },
      });
    });

    this.logger.log(`Folder ${folderId} soft-deleted by user ${userId}`);
  }
}
