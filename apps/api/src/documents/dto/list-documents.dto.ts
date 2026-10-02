import { IsInt, IsOptional, IsString, IsUUID, Min, Max, MaxLength, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListDocumentsDto {
  @ApiPropertyOptional({ example: 1, description: 'Page number (1-indexed)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, description: 'Items per page (max 100)' })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by folder ID, or "root" for documents not in a folder' })
  @ValidateIf((o: ListDocumentsDto) => o.folderId !== undefined && o.folderId !== 'root')
  @IsUUID()
  @IsOptional()
  folderId?: string;

  @ApiPropertyOptional({ description: 'Search by name' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  search?: string;
}
