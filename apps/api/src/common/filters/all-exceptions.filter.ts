/**
 * Global Exception Filter
 *
 * ────────────────────────────────────────────────────────
 * WHY A GLOBAL EXCEPTION FILTER?
 * ────────────────────────────────────────────────────────
 * Without this filter, NestJS returns different error shapes depending on
 * where the error is thrown:
 * - Validation errors: { statusCode, message: string[], error }
 * - HTTP exceptions: { statusCode, message, error }
 * - Unhandled errors: { statusCode: 500, message: 'Internal server error' }
 *
 * With a global filter, ALL errors return a consistent shape:
 * {
 *   statusCode: 404,
 *   error: "Not Found",
 *   message: "Document not found",
 *   requestId: "abc-123",
 *   timestamp: "2024-01-01T00:00:00.000Z",
 *   path: "/api/v1/documents/xyz"
 * }
 *
 * This makes frontend error handling trivial and logs easier to parse.
 *
 * ────────────────────────────────────────────────────────
 * SECURITY: NEVER LEAK INTERNAL ERRORS
 * ────────────────────────────────────────────────────────
 * If a 500 error leaks the stack trace or DB error message to the client,
 * an attacker can learn about your internal structure.
 * We ALWAYS return a generic "Internal server error" for 5xx.
 * The real error is logged server-side with the requestId for debugging.
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId: string | undefined;
  timestamp: string;
  path: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const requestId = request.headers['x-request-id'] as string | undefined;
    const path = request.url;

    let statusCode: number;
    let error: string;
    let message: string | string[];

    // ── Handle known exception types ──────────────────
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp['message'] as string | string[]) ?? exception.message;
        error = (resp['error'] as string) ?? HttpStatus[statusCode] ?? 'Error';
      } else {
        message = exception.message;
        error = 'Error';
      }
    } else if (exception instanceof ZodError) {
      // Zod validation errors from manual validation (not class-validator)
      statusCode = 422;
      error = 'Unprocessable Entity';
      message = exception.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    } else if (exception instanceof Error) {
      // Unhandled errors — log fully server-side, return generic message
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      error = 'Internal Server Error';
      message = 'An unexpected error occurred';

      this.logger.error(
        `Unhandled exception [${requestId}]: ${exception.message}`,
        exception.stack,
      );
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      error = 'Internal Server Error';
      message = 'An unexpected error occurred';
    }

    // Log 4xx at warn level, 5xx at error level
    if (statusCode >= 500) {
      this.logger.error(`[${requestId}] ${statusCode} ${path}: ${JSON.stringify(message)}`);
    } else if (statusCode >= 400) {
      this.logger.warn(`[${requestId}] ${statusCode} ${path}: ${JSON.stringify(message)}`);
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      error,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      path,
    };

    void reply.status(statusCode).send(errorResponse);
  }
}
