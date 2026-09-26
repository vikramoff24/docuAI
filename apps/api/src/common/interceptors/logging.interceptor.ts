/**
 * Logging Interceptor
 *
 * Logs every incoming request and outgoing response with:
 * - Request ID (for distributed tracing correlation)
 * - HTTP method + path
 * - Response status code
 * - Response time in milliseconds
 *
 * ────────────────────────────────────────────────────────
 * INTERCEPTORS vs. MIDDLEWARE vs. GUARDS
 * ────────────────────────────────────────────────────────
 * Middleware: Runs before routing (access to raw request, no NestJS context)
 * Guards:     Runs after middleware, decides allow/deny
 * Interceptors: Wrap the handler, can modify request AND response
 * Pipes:      Transform/validate input
 * Filters:    Handle exceptions
 *
 * Order: Middleware → Guard → Interceptor (pre) → Pipe → Handler → Interceptor (post) → Filter
 *
 * For logging, an interceptor is ideal because we can:
 * 1. Record the start time BEFORE the handler
 * 2. Log the response time AFTER the handler completes
 * 3. See the final response data if needed
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();

    // Inject a unique request ID if not already present
    // X-Request-ID is set by API gateway / load balancer in production
    // We generate one locally for dev / direct API calls
    const requestId = (request.headers['x-request-id'] as string) ?? uuidv4();
    request.headers['x-request-id'] = requestId;

    const { method, url } = request;
    const startTime = Date.now();

    this.logger.log(`→ ${method} ${url} [${requestId}]`);

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = reply.statusCode;

          // Attach request ID to response (allows client to correlate with server logs)
          void reply.header('X-Request-ID', requestId);

          this.logger.log(
            `← ${method} ${url} ${statusCode} ${duration}ms [${requestId}]`,
          );
        },
        error: () => {
          const duration = Date.now() - startTime;
          this.logger.warn(`← ${method} ${url} ERROR ${duration}ms [${requestId}]`);
        },
      }),
    );
  }
}
