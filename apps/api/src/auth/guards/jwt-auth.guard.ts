import { Injectable, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import Redis from 'ioredis';

import { REDIS_CLIENT } from '../../redis/redis.module';

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
 * - Token jti has been blacklisted (user logged out before expiry)
 *
 * ────────────────────────────────────────────────────────
 * WHY WE DON'T INJECT JwtService HERE
 * ────────────────────────────────────────────────────────
 * Guards are resolved in the context of each module that uses them
 * (via @UseGuards). JwtService is exported from AuthModule/JwtModule
 * but NOT re-exported to UsersModule, OrganizationsModule, etc.
 *
 * Rather than import JwtModule in every feature module (bad coupling),
 * we decode the JWT payload manually — just base64url-decoding the
 * payload section. We're NOT verifying the signature here (that's
 * already done by passport-jwt in super.canActivate()). We only
 * need the jti claim.
 *
 * ────────────────────────────────────────────────────────
 * BLACKLIST CHECK (using jti)
 * ────────────────────────────────────────────────────────
 * We extract the jti (JWT ID) claim from the token payload and
 * check Redis for `blacklist:<jti>`. If found → token is revoked.
 *
 * Performance: Redis GET is ~0.1ms — negligible overhead.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Extract token before calling super (which may throw on failure)
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // 1. Run Passport JWT validation (signature + expiry check)
    const parentResult = super.canActivate(context);

    // 2. Chain the Redis blacklist check
    if (parentResult instanceof Promise) {
      return parentResult.then(async (isValid) => {
        if (!isValid) return false;
        return this.checkBlacklist(token);
      });
    }

    if (parentResult instanceof Observable) {
      return new Promise<boolean>((resolve, reject) => {
        (parentResult as Observable<boolean>).subscribe({
          next: async (isValid) => {
            if (!isValid) { resolve(false); return; }
            resolve(this.checkBlacklist(token));
          },
          error: reject,
        });
      });
    }

    if (!parentResult) return false;
    return this.checkBlacklist(token);
  }

  private async checkBlacklist(token: string | null): Promise<boolean> {
    if (!token) return true;

    try {
      // Decode WITHOUT verification — passport-jwt already verified above.
      // A JWT is header.payload.signature (base64url separated by dots).
      // We just need the payload to extract the jti claim.
      const parts = token.split('.');
      if (parts.length !== 3) return true;

      // base64url → base64 → JSON
      const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson) as { jti?: string };

      if (!payload.jti) return true; // Token predates jti support — allow it

      const blacklisted = await this.redis.get(`blacklist:${payload.jti}`);
      if (blacklisted !== null) {
        throw new UnauthorizedException('Token has been revoked');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      // Any parse error — don't block (graceful degradation)
    }

    return true;
  }
}
