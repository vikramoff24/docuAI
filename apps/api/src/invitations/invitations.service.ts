/**
 * InvitationsService
 *
 * Handles organization invitation lifecycle:
 * - Create invitation (admin/owner only) → store in DB with token
 * - List pending invitations for an org
 * - Accept invitation → create membership
 * - Cancel invitation
 *
 * ────────────────────────────────────────────────────────
 * SECURITY DESIGN
 * ────────────────────────────────────────────────────────
 * Invitation tokens are:
 * 1. Cryptographically random UUIDs (not guessable)
 * 2. Short-lived (7 days by default)
 * 3. Single-use (accepted tokens are marked as ACCEPTED)
 * 4. Tied to a specific email (cannot be used by someone else)
 *
 * WHY NOT USE JWT for invitation tokens?
 * - JWTs are self-contained — can't be revoked before expiry
 * - DB-stored tokens can be cancelled by an admin at any time
 * - Simpler to manage token state (PENDING/ACCEPTED/EXPIRED/CANCELLED)
 *
 * MULTI-TENANCY:
 * organizationId always comes from the JWT (req.user), never from
 * the request body. This prevents cross-tenant invitation attacks.
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { InvitationStatus, OrganizationMemberRole } from '@prisma/client';

import { DatabaseService } from '../database/database.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';

// Roles that can send invitations
const CAN_INVITE = new Set<OrganizationMemberRole>([
  OrganizationMemberRole.OWNER,
  OrganizationMemberRole.ADMIN,
]);

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(private readonly db: DatabaseService) {}

  // ──────────────────────────────────────────────────
  // CREATE INVITATION
  // ──────────────────────────────────────────────────

  async createInvitation(
    organizationId: string,
    invitedById: string,
    inviterRole: OrganizationMemberRole,
    dto: CreateInvitationDto,
  ) {
    // Authorization: only OWNER and ADMIN can invite
    if (!CAN_INVITE.has(inviterRole)) {
      throw new ForbiddenException('Only organization admins can send invitations');
    }

    // Check the invitee isn't already a member
    const existingMember = await this.db.organizationMember.findFirst({
      where: {
        organizationId,
        user: { email: dto.email },
      },
    });

    if (existingMember) {
      throw new ConflictException('This user is already a member of the organization');
    }

    // Check for an existing PENDING invitation
    const existingInvite = await this.db.invitation.findFirst({
      where: {
        organizationId,
        email: dto.email,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() }, // Not yet expired
      },
    });

    if (existingInvite) {
      throw new ConflictException('A pending invitation already exists for this email');
    }

    // Generate invitation token and expiry (7 days)
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await this.db.invitation.create({
      data: {
        organizationId,
        email: dto.email,
        role: dto.role ?? OrganizationMemberRole.MEMBER,
        token,
        status: InvitationStatus.PENDING,
        invitedById,
        expiresAt,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        invitedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    // TODO Phase 7: Send invitation email via email service
    // For now, return the token in the response (dev-only, remove in production)
    this.logger.log(
      `Invitation sent to ${dto.email} for org ${organizationId} by ${invitedById}`,
    );

    return {
      ...invitation,
      // Include token in dev only — production email service would handle delivery
      invitationToken: process.env['NODE_ENV'] !== 'production' ? token : undefined,
    };
  }

  // ──────────────────────────────────────────────────
  // LIST INVITATIONS
  // ──────────────────────────────────────────────────

  async listInvitations(organizationId: string, requestingRole: OrganizationMemberRole) {
    // Only OWNER and ADMIN can see the invitation list
    if (!CAN_INVITE.has(requestingRole)) {
      throw new ForbiddenException('Only organization admins can view invitations');
    }

    return this.db.invitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        invitedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  // ──────────────────────────────────────────────────
  // ACCEPT INVITATION
  // ──────────────────────────────────────────────────

  async acceptInvitation(token: string, acceptingUserEmail: string) {
    const invitation = await this.db.invitation.findUnique({
      where: { token },
      include: { organization: true },
    });

    if (!invitation) {
      // Don't reveal whether token exists — security
      throw new NotFoundException('Invitation not found or has expired');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException(`Invitation is ${invitation.status.toLowerCase()}`);
    }

    if (invitation.expiresAt < new Date()) {
      // Auto-expire it
      await this.db.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new ConflictException('This invitation has expired');
    }

    // Security: the token must match the intended email
    // This prevents someone from forwarding an invitation intended for someone else
    if (invitation.email.toLowerCase() !== acceptingUserEmail.toLowerCase()) {
      throw new ForbiddenException('This invitation was not intended for your email address');
    }

    // Find the accepting user's account
    const user = await this.db.user.findUnique({
      where: { email: acceptingUserEmail },
    });

    if (!user) {
      // User needs to register first — this is a valid flow
      throw new NotFoundException('Please register an account before accepting the invitation');
    }

    // Check if already a member of this org
    const existingMembership = await this.db.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: invitation.organizationId,
        },
      },
    });

    if (existingMembership) {
      // Idempotent: mark invitation as accepted even if already a member
      await this.db.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED },
      });
      return { alreadyMember: true, organization: invitation.organization };
    }

    // Accept in a transaction: create membership + update invitation status
    await this.db.$transaction([
      this.db.organizationMember.create({
        data: {
          userId: user.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      }),
      this.db.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED },
      }),
    ]);

    this.logger.log(
      `Invitation accepted: ${acceptingUserEmail} joined org ${invitation.organizationId} as ${invitation.role}`,
    );

    return {
      organization: {
        id: invitation.organization.id,
        name: invitation.organization.name,
        slug: invitation.organization.slug,
      },
      role: invitation.role,
    };
  }

  // ──────────────────────────────────────────────────
  // CANCEL INVITATION
  // ──────────────────────────────────────────────────

  async cancelInvitation(
    invitationId: string,
    organizationId: string,
    requestingRole: OrganizationMemberRole,
  ) {
    if (!CAN_INVITE.has(requestingRole)) {
      throw new ForbiddenException('Only organization admins can cancel invitations');
    }

    const invitation = await this.db.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.organizationId !== organizationId) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException('Only pending invitations can be cancelled');
    }

    return this.db.invitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.CANCELLED },
      select: { id: true, status: true },
    });
  }
}
