import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptInvitationDto {
  @ApiProperty({ description: 'Token from the invitation' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  token!: string;
}
