import { IsString, IsOptional, IsUUID, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFolderDto {
  @ApiProperty({ example: 'Legal Documents' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Parent folder ID (null = root)' })
  @IsUUID()
  @IsOptional()
  parentId?: string;
}
