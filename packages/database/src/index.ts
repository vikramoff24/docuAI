/**
 * @docuflow/database — public exports
 *
 * Re-exports the Prisma client and all generated types so consuming packages
 * don't need to import directly from `@prisma/client`.
 */

export { PrismaClient, Prisma } from '@prisma/client';
export type {
  User,
  RefreshToken,
  Organization,
  OrganizationMember,
  Invitation,
  Folder,
  Document,
  DocumentChunk,
  DocumentShare,
  Conversation,
  Message,
  AuditLog,
} from '@prisma/client';
