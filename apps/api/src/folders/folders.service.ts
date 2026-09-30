import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { CreateFolderDto } from './dto/create-folder.dto';

@Injectable()
export class FoldersService {
  private readonly logger = new Logger(FoldersService.name);

  constructor(private readonly db: DatabaseService) {}

  async createFolder(
    organizationId: string,
    userId: string,
    dto: CreateFolderDto,
  ) {
    // If parentId provided, verify it belongs to the same org
    let parentPath = '/';
    if (dto.parentId) {
      const parent = await this.db.folder.findFirst({
        where: { id: dto.parentId, organizationId, deletedAt: null },
      });
      if (!parent) throw new NotFoundException('Parent folder not found');
      parentPath = parent.path;
    }

    // Check for name conflict in same parent
    const existing = await this.db.folder.findFirst({
      where: {
        organizationId,
        parentId: dto.parentId ?? null,
        name: dto.name,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictException('A folder with this name already exists in this location');
    }

    // Build materialized path
    const path = parentPath === '/'
      ? `/${dto.name}`
      : `${parentPath}/${dto.name}`;

    const folder = await this.db.folder.create({
      data: {
        organizationId,
        parentId: dto.parentId,
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
  }

  async listFolders(organizationId: string, parentId?: string) {
    return this.db.folder.findMany({
      where: {
        organizationId,
        parentId: parentId ?? null,
        deletedAt: null,
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        path: true,
        parentId: true,
        createdAt: true,
        _count: { select: { children: true, documents: true } },
      },
    });
  }

  async deleteFolder(
    folderId: string,
    organizationId: string,
    userId: string,
  ) {
    const folder = await this.db.folder.findFirst({
      where: { id: folderId, organizationId, deletedAt: null },
      include: { _count: { select: { children: true, documents: true } } },
    });

    if (!folder) throw new NotFoundException('Folder not found');

    // Don't delete root folder
    if (folder.parentId === null) {
      throw new ConflictException('Cannot delete the root folder');
    }

    // Prevent deleting non-empty folders (simple safety check)
    if (folder._count.children > 0 || folder._count.documents > 0) {
      throw new ConflictException('Cannot delete a folder that contains items');
    }

    await this.db.folder.update({
      where: { id: folderId },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Folder ${folderId} soft-deleted by user ${userId}`);
  }
}
