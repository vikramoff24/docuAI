import { IsString, IsOptional, IsArray, IsUUID, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  title?: string;

  /**
   * Optional: Restrict this conversation to specific documents.
   * If provided, RAG retrieval will only search these documents.
   * If not provided, the entire organization's documents are searched.
   */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  documentIds?: string[];
}
