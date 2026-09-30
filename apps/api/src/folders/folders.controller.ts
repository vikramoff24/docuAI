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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { FoldersService } from './folders.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('folders')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('folders')
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
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
    @Query('parentId') parentId?: string,
  ) {
    return this.foldersService.listFolders(user.organizationId, parentId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an empty folder' })
  @ApiResponse({ status: 204, description: 'Folder deleted' })
  @ApiResponse({ status: 409, description: 'Folder is not empty' })
  async deleteFolder(
    @CurrentUser() user: RequestUser,
    @Param('id') folderId: string,
  ) {
    await this.foldersService.deleteFolder(folderId, user.organizationId, user.userId);
  }
}
