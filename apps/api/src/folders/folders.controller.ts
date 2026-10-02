import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { OrganizationMemberRole } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { FoldersService } from './folders.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('folders')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('folders')
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(OrganizationMemberRole.MEMBER)
  @ApiOperation({ summary: 'Create a new folder' })
  @ApiResponse({ status: 201, description: 'Folder created' })
  @ApiResponse({ status: 409, description: 'Folder with this name already exists' })
  async createFolder(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateFolderDto,
  ) {
    return this.foldersService.createFolder(user.organizationId, user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List folders (root by default, or children of parentId)' })
  async listFolders(
    @CurrentUser() user: RequestUser,
    @Query('parentId', new ParseUUIDPipe({ optional: true })) parentId?: string,
  ) {
    return this.foldersService.listFolders(user.organizationId, parentId);
  }

  @Get('all')
  @ApiOperation({ summary: 'List every folder in the organization (flat, ordered by path)' })
  async listAllFolders(@CurrentUser() user: RequestUser) {
    return this.foldersService.listAllFolders(user.organizationId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(OrganizationMemberRole.MEMBER)
  @ApiOperation({ summary: 'Delete an empty folder' })
  @ApiResponse({ status: 204, description: 'Folder deleted' })
  @ApiResponse({ status: 409, description: 'Folder is not empty' })
  async deleteFolder(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) folderId: string,
  ) {
    await this.foldersService.deleteFolder(folderId, user.organizationId, user.userId);
  }
}
