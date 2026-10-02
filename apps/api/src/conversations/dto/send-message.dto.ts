import { IsString, IsOptional, IsArray, IsUUID, MinLength, MaxLength, ArrayMaxSize } from 'class-validator';
import { Trim } from '../../common/transforms/string.transforms';

export class SendMessageDto {
  /**
   * The user's message content.
   */
  @Trim()
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
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  documentIds?: string[];
}
