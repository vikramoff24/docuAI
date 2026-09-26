import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

import { RequestUser } from '../strategies/jwt.strategy';

/**
 * @CurrentUser() decorator — extracts the authenticated user from req.user
 *
 * Usage:
 *   @Get('me')
 *   @UseGuards(JwtAuthGuard)
 *   getProfile(@CurrentUser() user: RequestUser) {
 *     return user;
 *   }
 *
 * This is cleaner than injecting the request object and accessing req.user manually.
 * NestJS custom decorators are a great way to encapsulate common request data extraction.
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user: RequestUser }>();
    return request.user;
  },
);
