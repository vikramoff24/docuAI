/**
 * Transform Interceptor — Standardizes all API responses.
 *
 * Wraps every successful response in:
 * {
 *   data: <actual response>,
 *   meta: {
 *     requestId: "...",
 *     timestamp: "..."
 *   }
 * }
 *
 * WHY WRAP RESPONSES?
 * Consistent structure means:
 * - Frontend always knows where the data is
 * - Can add pagination metadata without breaking existing consumers
 * - Easy to add fields like 'warnings', 'deprecations' later
 * - Clear distinction between error shape and success shape
 *
 * The AllExceptionsFilter handles error shape — this handles success shape.
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { FastifyRequest } from 'fastify';

export interface ApiResponse<T> {
  data: T;
  meta: {
    requestId: string | undefined;
    timestamp: string;
  };
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const requestId = request.headers['x-request-id'] as string | undefined;

    return next.handle().pipe(
      map((data) => ({
        data,
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
        },
      })),
    );
  }
}
