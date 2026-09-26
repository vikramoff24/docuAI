import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JwtAuthGuard — Protects routes requiring authentication.
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard)
 *   @Get('profile')
 *   getProfile(@CurrentUser() user: RequestUser) { ... }
 *
 * Extending AuthGuard('jwt') triggers JwtStrategy.validate()
 * which populates req.user with the decoded JWT payload.
 *
 * Returns 401 Unauthorized if:
 * - No Authorization header
 * - Invalid JWT signature
 * - Expired JWT
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
