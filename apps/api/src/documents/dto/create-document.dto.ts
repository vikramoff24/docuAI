import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  MaxLength,
  IsNotEmpty,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class CreateDocumentDto {
  @ApiProperty({ example: 'Q3 Financial Report.pdf' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Quarterly financial report for Q3 2026' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiProperty({ example: 1024000, description: 'File size in bytes (max 100MB = 104857600)' })
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(104857600) // 100MB
  @Type(() => Number)
  sizeBytes: number;

  @ApiPropertyOptional({ example: 'folder-uuid' })
  @IsUUID()
  @IsOptional()
  folderId?: string;

  @ApiPropertyOptional({ example: ['finance', 'q3', '2026'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : []))
  tags?: string[];
}
