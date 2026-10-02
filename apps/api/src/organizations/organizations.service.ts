import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { OrganizationMemberRole, Prisma } from '@prisma/client';

import { DatabaseService } from '../database/database.service';
import { ROLE_RANK, isAdminRole } from '../common/roles';

const MEMBER_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
} as const;

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
    const members = await this.db.organizationMember.findMany({
      where: { organizationId },
      include: { user: { select: MEMBER_USER_SELECT } },
      orderBy: { joinedAt: 'asc' },
    });
    return members.map((m) => this.toMember(m));
  }

  /**
   * Rules (rank VIEWER < MEMBER < ADMIN < OWNER):
   * - only ADMIN+ manage others, and only people ranked below them (OWNERs may manage OWNERs);
   * - nobody grants a role above their own, or changes their own role;
   * - an organization always keeps at least one OWNER.
   */
  async updateMemberRole(
    organizationId: string,
    targetUserId: string,
    newRole: OrganizationMemberRole,
    requester: { userId: string; role: OrganizationMemberRole },
  ) {
    if (targetUserId === requester.userId) {
      throw new ForbiddenException('You cannot change your own role');
    }
    const target = await this.findMembership(organizationId, targetUserId);
    this.assertCanManage(requester.role, target.role);
    if (ROLE_RANK[newRole] > ROLE_RANK[requester.role]) {
      throw new ForbiddenException(`A ${requester.role} cannot make someone ${newRole}`);
    }
    if (target.role === newRole) return this.toMember(target);

    const updated = await this.db.$transaction(async (tx) => {
      if (target.role === OrganizationMemberRole.OWNER) {
        await this.assertAnotherOwnerRemains(tx, organizationId, target.id);
      }
      const member = await tx.organizationMember.update({
        where: { id: target.id },
        data: { role: newRole },
        include: { user: { select: MEMBER_USER_SELECT } },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: requester.userId,
          action: 'ORG_MEMBER_ROLE_CHANGED',
          resourceType: 'member',
          resourceId: targetUserId,
          metadata: { from: target.role, to: newRole },
        },
      });
      return member;
    });
    return this.toMember(updated);
  }

  /** Removes a member, or — when target is the requester — leaves the organization. */
  async removeMember(
    organizationId: string,
    targetUserId: string,
    requester: { userId: string; role: OrganizationMemberRole },
  ) {
    const target = await this.findMembership(organizationId, targetUserId);
    const leaving = targetUserId === requester.userId;

    if (leaving) {
      const memberships = await this.db.organizationMember.count({ where: { userId: targetUserId } });
      if (memberships <= 1) {
        throw new ConflictException("You can't leave your only organization");
      }
    } else {
      this.assertCanManage(requester.role, target.role);
    }

    await this.db.$transaction(async (tx) => {
      if (target.role === OrganizationMemberRole.OWNER) {
        await this.assertAnotherOwnerRemains(tx, organizationId, target.id);
      }
      await tx.organizationMember.delete({ where: { id: target.id } });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: requester.userId,
          action: 'ORG_MEMBER_REMOVED',
          resourceType: 'member',
          resourceId: targetUserId,
          metadata: { role: target.role, left: leaving },
        },
      });
    });
  }

  /**
   * Locks the organization's OWNER rows, so two owners removing or demoting each
   * other at the same time are serialized and can't leave the organization
   * without any owner (the second one re-reads after the first commits).
   */
  private async assertAnotherOwnerRemains(
    tx: Prisma.TransactionClient,
    organizationId: string,
    leavingMembershipId: string,
  ) {
    const owners = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "organization_members"
      WHERE "organizationId" = ${organizationId}::uuid AND "role" = 'OWNER'
      FOR UPDATE`;
    if (!owners.some((o) => o.id !== leavingMembershipId)) {
      throw new ConflictException('Make someone else an owner before the last owner leaves');
    }
  }

  private async findMembership(organizationId: string, userId: string) {
    const membership = await this.db.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { user: { select: MEMBER_USER_SELECT } },
    });
    if (!membership) throw new NotFoundException('Member not found');
    return membership;
  }

  private assertCanManage(requesterRole: OrganizationMemberRole, targetRole: OrganizationMemberRole) {
    if (!isAdminRole(requesterRole)) {
      throw new ForbiddenException('Only admins can manage members');
    }
    const outranks = ROLE_RANK[requesterRole] > ROLE_RANK[targetRole];
    if (!outranks && requesterRole !== OrganizationMemberRole.OWNER) {
      throw new ForbiddenException(`A ${requesterRole} cannot manage a ${targetRole}`);
    }
  }

  private toMember(m: { userId: string; role: OrganizationMemberRole; joinedAt: Date; user: unknown }) {
    return { userId: m.userId, role: m.role, joinedAt: m.joinedAt, user: m.user };
  }
}
