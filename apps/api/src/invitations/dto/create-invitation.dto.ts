import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationMemberRole } from '@prisma/client';
import { NormalizeEmail } from '../../common/transforms/string.transforms';

export class CreateInvitationDto {
  @ApiProperty({ example: 'newmember@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ enum: OrganizationMemberRole, default: 'MEMBER' })
  @IsEnum(OrganizationMemberRole)
  @IsOptional()
  role?: OrganizationMemberRole = OrganizationMemberRole.MEMBER;
}
