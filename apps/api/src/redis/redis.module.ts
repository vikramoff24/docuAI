/**
 * RedisModule — Global Redis client for the API
 *
 * ────────────────────────────────────────────────────────
 * WHY REDIS FOR TOKEN BLACKLISTING?
 * ────────────────────────────────────────────────────────
 * Access tokens are stateless JWTs. Once issued, they are valid
 * until expiry — even after logout. This is a security problem:
 *
 *   1. User logs out
 *   2. Attacker has stolen the access token
 *   3. Token still works for up to 15 minutes
 *
 * Solution: On logout, store the token's JTI (JWT ID) or the full
 * token in Redis with a TTL matching the token expiry.
 * The JWT guard checks Redis before authorizing.
 *
 * WHY REDIS AND NOT THE DATABASE?
 * - DB reads on EVERY request are expensive
 * - Redis is in-memory: sub-millisecond lookups
 * - Redis TTL: keys auto-expire — no cleanup needed
 * - This is exactly the use case Redis was designed for
 *
 * ────────────────────────────────────────────────────────
 * NESTJS CUSTOM PROVIDER PATTERN
 * ────────────────────────────────────────────────────────
 * We use a custom provider with an injection token (REDIS_CLIENT)
 * instead of a class-based provider, because ioredis is a plain
 * class from a third-party library, not a NestJS service.
 *
 * This is the standard pattern for wrapping third-party clients
 * in NestJS (database connections, HTTP clients, etc.)
 */

import { Global, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    const redisUrl = config.get<string>('redis.url', 'redis://localhost:6379');

    const client = new Redis(redisUrl, {
      // Retry strategy — exponential backoff
      retryStrategy: (times) => {
        if (times > 5) {
          // Give up after 5 retries — app will fail healthcheck
          return null;
        }
        return Math.min(times * 100, 3000); // Wait up to 3s between retries
      },
      lazyConnect: false,     // Connect immediately
      enableOfflineQueue: true, // Queue commands during reconnect
      maxRetriesPerRequest: 3,
    });

    client.on('connect', () => console.log('[Redis] Connected'));
    client.on('error', (err) => console.error('[Redis] Error:', err.message));
    client.on('ready', () => console.log('[Redis] Ready'));

    return client;
  },
};

@Global()
@Module({
  providers: [redisProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
