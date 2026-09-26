/**
 * RBAC Guard — Role-Based Access Control
 *
 * ────────────────────────────────────────────────────────
 * AUTHORIZATION MODEL
 * ────────────────────────────────────────────────────────
 *
 * Roles (in order of increasing privilege):
 *   VIEWER < MEMBER < ADMIN < OWNER
 *
 * Role hierarchy means ADMIN can do everything MEMBER can do, etc.
 *
 * Usage:
 *   @Roles(OrganizationMemberRole.ADMIN)
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Delete(':id')
 *   deleteDocument(...) { ... }
 *
 * This ensures only ADMIN and OWNER can delete documents.
 *
 * ────────────────────────────────────────────────────────
 * WHY SEPARATE JwtAuthGuard AND RolesGuard?
 * ────────────────────────────────────────────────────────
 * 1. JwtAuthGuard: authenticates (who are you?)
 * 2. RolesGuard: authorizes (are you allowed?)
 *
 * They're separate because:
 * - Some routes need auth but no specific role (just "logged in")
 * - Some routes need specific roles
 * - The separation follows Single Responsibility Principle
 *
 * Order matters: JwtAuthGuard MUST run before RolesGuard
 * (so req.user is populated before we check the role)
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationMemberRole } from '@prisma/client';
import { FastifyRequest } from 'fastify';

import { RequestUser } from '../strategies/jwt.strategy';

// Role hierarchy (higher index = higher privilege)
const ROLE_HIERARCHY: OrganizationMemberRole[] = [
  OrganizationMemberRole.VIEWER,
  OrganizationMemberRole.MEMBER,
  OrganizationMemberRole.ADMIN,
  OrganizationMemberRole.OWNER,
];

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles on a route or controller.
 * Usage: @Roles(OrganizationMemberRole.ADMIN)
 */
export const Roles = (...roles: OrganizationMemberRole[]) =>
  SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from @Roles() decorator
    const requiredRoles = this.reflector.getAllAndOverride<OrganizationMemberRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no @Roles() decorator, allow any authenticated user
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest & { user: RequestUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const userRoleIndex = ROLE_HIERARCHY.indexOf(user.role);

    // Check if user's role meets any of the required roles
    // With hierarchy: an OWNER satisfies @Roles(ADMIN) because OWNER > ADMIN
    const hasRole = requiredRoles.some((requiredRole) => {
      const requiredRoleIndex = ROLE_HIERARCHY.indexOf(requiredRole);
      return userRoleIndex >= requiredRoleIndex;
    });

    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredRoles.join(' or ')}, Current: ${user.role}`,
      );
    }

    return true;
  }
}
