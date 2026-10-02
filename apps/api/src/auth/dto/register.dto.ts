import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength, Matches, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NormalizeEmail, Trim } from '../../common/transforms/string.transforms';

/**
 * Data Transfer Object (DTO) for user registration.
 *
 * ────────────────────────────────────────────────────────
 * WHAT IS A DTO?
 * ────────────────────────────────────────────────────────
 * DTOs are plain classes that:
 * 1. Define the SHAPE of incoming request data
 * 2. Are VALIDATED by class-validator decorators
 * 3. Are TRANSFORMED by class-transformer (e.g., trim strings)
 * 4. Are documented via @nestjs/swagger decorators
 *
 * The ValidationPipe in main.ts processes these automatically.
 * If any validation fails, a 422 response is returned before
 * the controller method even runs.
 *
 * ────────────────────────────────────────────────────────
 * WHY VALIDATE INPUT SERVER-SIDE?
 * ────────────────────────────────────────────────────────
 * Client-side validation (Zod, RHF) is for UX — it's optional.
 * Server-side validation is MANDATORY security.
 * Never trust client input. Always validate, always sanitize.
 *
 * Example attacks without server-side validation:
 * - SQL injection via email field (Prisma parameterizes, but defense in depth)
 * - Storing malicious scripts in name fields (XSS stored)
 * - Bypassing client validation via curl/Postman
 */
export class RegisterDto {
  @ApiProperty({ example: 'alice@acme.com' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    { message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' },
  )
  password!: string;

  @ApiProperty({ example: 'Alice' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(50)
  firstName!: string;

  @ApiProperty({ example: 'Smith' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MaxLength(50)
  lastName!: string;

  @ApiProperty({ example: 'Acme Corp', description: 'Required unless signing up through an invitation' })
  @ValidateIf((o: RegisterDto) => !o.invitationToken)
  @Trim()
  @IsString()
  @MinLength(2, { message: 'Organization name must be at least 2 characters' })
  @MaxLength(100)
  organizationName?: string;

  @ApiPropertyOptional({ description: 'Invitation token: join that organization instead of creating one' })
  @IsOptional()
  @IsUUID('all', { message: 'Invalid invitation link' })
  invitationToken?: string;
}
