import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OPENAI_KEY_PATTERN } from '@docuflow/ai';

export class SetOpenAIKeyDto {
  @ApiProperty({ description: 'OpenAI secret key (sk-...). Stored encrypted; never returned.', writeOnly: true })
  @IsString()
  @Matches(OPENAI_KEY_PATTERN, { message: 'That does not look like an OpenAI API key (it should start with "sk-")' })
  apiKey: string;
}
