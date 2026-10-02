import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail, ThrottlerRequest } from '@nestjs/throttler/dist/throttler.guard.interface';

/**
 * Global rate-limit guard (registered as APP_GUARD).
 *
 * Every limit — global and per-route (@RateLimit) — is scaled by
 * RATE_LIMIT_MULTIPLIER. 1 = production limits; a larger value relaxes them for
 * test suites that send many requests from one IP; 0 disables rate limiting.
 *
 * Requests are tracked by client IP (`req.ip`), which honours the TRUST_PROXY
 * setting — see main.ts. Never key on a raw X-Forwarded-For header: clients set it.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private get multiplier(): number {
    const value = Number(process.env.RATE_LIMIT_MULTIPLIER ?? '1');
    return Number.isFinite(value) && value >= 0 ? value : 1;
  }

  protected override async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    return this.multiplier === 0;
  }

  protected override handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const limit = Math.max(1, Math.ceil(requestProps.limit * this.multiplier));
    return super.handleRequest({ ...requestProps, limit });
  }

  protected override async getErrorMessage(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<string> {
    const seconds = Math.max(1, detail.timeToBlockExpire);
    const wait = seconds >= 120 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`;
    return `Too many requests. Please wait ${wait} and try again.`;
  }
}
