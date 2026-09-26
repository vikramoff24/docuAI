import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { OrganizationMemberRole } from '@prisma/client';

import { DatabaseService } from '../database/database.service';

@Injectable()
export class OrganizationsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Get organization by ID — ALWAYS scoped to the requesting user's org.
   * This is the tenant isolation pattern: organizationId comes from JWT,
   * not from the client request body.
   */
  async findById(organizationId: string, requestingUserId: string) {
    // Verify the requesting user is a member of this organization
    const membership = await this.db.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: requestingUserId,
          organizationId,
        },
      },
    });

    if (!membership) {
      // Return 404, not 403 — don't reveal the org exists
      throw new NotFoundException('Organization not found');
    }

    return this.db.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        logoUrl: true,
        createdAt: true,
        _count: {
          select: { members: true, documents: true },
        },
      },
    });
  }

  async getMembers(organizationId: string) {
    return this.db.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async updateMemberRole(
    organizationId: string,
    targetUserId: string,
    newRole: OrganizationMemberRole,
    requestingUserId: string,
    requestingRole: OrganizationMemberRole,
  ) {
    // Only OWNER can change roles
    if (requestingRole !== OrganizationMemberRole.OWNER) {
      throw new ForbiddenException('Only the organization owner can change member roles');
    }

    // Cannot change the owner's own role (would leave org without owner)
    if (targetUserId === requestingUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }

    return this.db.organizationMember.update({
      where: {
        userId_organizationId: { userId: targetUserId, organizationId },
      },
      data: { role: newRole },
    });
  }

  async removeMember(organizationId: string, targetUserId: string, requestingRole: OrganizationMemberRole) {
    if (requestingRole === OrganizationMemberRole.VIEWER || requestingRole === OrganizationMemberRole.MEMBER) {
      throw new ForbiddenException('Insufficient permissions to remove members');
    }

    return this.db.organizationMember.delete({
      where: {
        userId_organizationId: { userId: targetUserId, organizationId },
      },
    });
  }
}
