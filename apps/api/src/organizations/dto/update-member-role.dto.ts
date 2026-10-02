import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrganizationMemberRole } from '@prisma/client';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: OrganizationMemberRole })
  @IsEnum(OrganizationMemberRole)
  role!: OrganizationMemberRole;
}
