import { IsString, IsNotEmpty, IsObject, IsOptional, IsIn, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Trim } from '../../common/transforms/string.transforms';

export const WORKFLOW_TYPES = ['document_categorization', 'data_extraction', 'general'] as const;
export const MAX_INSTRUCTIONS_LENGTH = 2000;
export const MAX_INPUT_BYTES = 4096;
export type WorkflowType = (typeof WORKFLOW_TYPES)[number];

export class CreateWorkflowDto {
  @ApiProperty({ enum: WORKFLOW_TYPES })
  @IsString()
  @IsNotEmpty()
  @IsIn(WORKFLOW_TYPES)
  type: WorkflowType;

  @ApiProperty({
    description: 'What the agent should do, in plain language',
    example: 'Categorize all invoices as Finance',
    maxLength: MAX_INSTRUCTIONS_LENGTH,
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_INSTRUCTIONS_LENGTH)
  instructions: string;

  @ApiPropertyOptional({
    description: 'Optional structured parameters passed to the agent alongside the instructions',
  })
  @IsObject()
  @IsOptional()
  input?: Record<string, unknown>;
}
