import { Inject, Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

import { REDIS_CLIENT } from '../../redis/redis.module';

/**
 * Fixed-window counter + block flag, atomically in one round-trip.
 * KEYS[1] = hit counter, KEYS[2] = block flag
 * ARGV[1] = window (ms), ARGV[2] = limit, ARGV[3] = block duration (ms)
 * Returns { hits, windowTtlMs, blockTtlMs }.
 */
const INCREMENT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  return { tonumber(redis.call('GET', KEYS[1]) or '0'), redis.call('PTTL', KEYS[1]), blockTtl }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  redis.call('DEL', KEYS[1])
  blockTtl = tonumber(ARGV[3])
end
return { hits, redis.call('PTTL', KEYS[1]), blockTtl }
`;

/**
 * Rate-limit counters in Redis, so limits hold across every API instance
 * (the default in-memory storage is per process).
 *
 * Fails open: if Redis errors, the request is allowed and a warning is logged.
 * Rate limiting is abuse protection, not authorization, and an outage of the
 * counter store shouldn't take the whole API down with it.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `throttle:${throttlerName}:${key}`;
    try {
      const [hits, windowTtlMs, blockTtlMs] = (await this.redis.eval(
        INCREMENT_SCRIPT,
        2,
        `${base}:hits`,
        `${base}:block`,
        ttl,
        limit,
        Math.max(blockDuration, 1),
      )) as [number, number, number];

      const isBlocked = blockTtlMs > 0;
      return {
        totalHits: hits,
        timeToExpire: Math.max(0, Math.ceil(windowTtlMs / 1000)),
        isBlocked,
        timeToBlockExpire: isBlocked ? Math.ceil(blockTtlMs / 1000) : 0,
      };
    } catch (err) {
      this.logger.warn(`Rate limit check skipped (Redis error): ${(err as Error).message}`);
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
