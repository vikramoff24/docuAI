import { IsString, IsOptional, IsArray, IsUUID, MinLength, MaxLength } from 'class-validator';

export class SendMessageDto {
  /**
   * The user's message content.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content: string;

  /**
   * Optional: Override the conversation's document scope for this message.
   * Useful for asking about a specific document in an open conversation.
   */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  documentIds?: string[];
}
