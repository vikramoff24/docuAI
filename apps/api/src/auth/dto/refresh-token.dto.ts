import { IsString, IsNotEmpty, MaxLength, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token from login or a previous refresh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  refreshToken!: string;

  @ApiPropertyOptional({ description: 'Switch the new session to this organization (must be a member)' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
