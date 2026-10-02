import { OrganizationMemberRole } from '@prisma/client';

/** Higher rank = more power. Used for "you can't grant or manage above yourself" rules. */
export const ROLE_RANK: Record<OrganizationMemberRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export const isAdminRole = (role: OrganizationMemberRole) => ROLE_RANK[role] >= ROLE_RANK.ADMIN;
