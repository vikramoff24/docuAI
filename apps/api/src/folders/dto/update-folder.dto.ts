import { IsString, IsOptional, IsUUID, MaxLength, IsNotEmpty, Matches, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Trim } from '../../common/transforms/string.transforms';

/** Rename and/or move a folder. Omitted fields stay as they are. */
export class UpdateFolderDto {
  @ApiPropertyOptional({ example: 'Contracts 2026' })
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  // "/" is the materialized-path separator
  @Matches(/^[^/\\]+$/, { message: 'Folder name cannot contain "/" or "\\"' })
  name?: string;

  @ApiPropertyOptional({ description: 'New parent folder, or null for the top level', nullable: true })
  // undefined = keep the current parent; null = top level; anything else must be a UUID
  @ValidateIf((o: UpdateFolderDto) => o.parentId !== undefined && o.parentId !== null)
  @IsUUID()
  parentId?: string | null;
}
