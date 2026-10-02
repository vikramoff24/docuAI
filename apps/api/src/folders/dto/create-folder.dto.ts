import { IsString, IsOptional, IsUUID, MaxLength, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Trim } from '../../common/transforms/string.transforms';

export class CreateFolderDto {
  @ApiProperty({ example: 'Legal Documents' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  // "/" is the materialized-path separator
  @Matches(/^[^/\\]+$/, { message: 'Folder name cannot contain "/" or "\\"' })
  name: string;

  @ApiPropertyOptional({ description: 'Parent folder ID (null = root)' })
  @IsUUID()
  @IsOptional()
  parentId?: string;
}
