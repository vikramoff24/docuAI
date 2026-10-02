import { IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MoveDocumentDto {
  @ApiProperty({ description: 'Target folder, or null to move out of all folders', nullable: true })
  // `null` is a valid destination; anything else (including a missing field) must be a UUID
  @ValidateIf((o: MoveDocumentDto) => o.folderId !== null)
  @IsUUID()
  folderId!: string | null;
}
