/**
 * DocuFlow AI — Database Seed Script
 *
 * Seeds the database with initial data for development.
 * Run: pnpm db:seed
 *
 * Creates:
 * - 2 organizations (Acme Corp, Beta Inc)
 * - 4 users (1 owner per org, 1 admin, 1 member, 1 viewer)
 * - Root folders for each org
 */

import { PrismaClient, OrganizationMemberRole, OrganizationPlan } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'Password123!';

async function main() {
  console.log('🌱 Starting database seed...');

  // Hash the default password
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

  // ========================================================
  // Create Organization: Acme Corp
  // ========================================================
  const acmeOrg = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corp',
      slug: 'acme-corp',
      plan: OrganizationPlan.PRO,
    },
  });
  console.log(`✅ Organization: ${acmeOrg.name} (${acmeOrg.id})`);

  // ========================================================
  // Create Organization: Beta Inc
  // ========================================================
  const betaOrg = await prisma.organization.upsert({
    where: { slug: 'beta-inc' },
    update: {},
    create: {
      name: 'Beta Inc',
      slug: 'beta-inc',
      plan: OrganizationPlan.FREE,
    },
  });
  console.log(`✅ Organization: ${betaOrg.name} (${betaOrg.id})`);

  // ========================================================
  // Create Users
  // ========================================================
  const users = [
    // Acme Corp users
    {
      email: 'alice@acme.com',
      firstName: 'Alice',
      lastName: 'Owner',
      org: acmeOrg,
      role: OrganizationMemberRole.OWNER,
    },
    {
      email: 'bob@acme.com',
      firstName: 'Bob',
      lastName: 'Admin',
      org: acmeOrg,
      role: OrganizationMemberRole.ADMIN,
    },
    {
      email: 'carol@acme.com',
      firstName: 'Carol',
      lastName: 'Member',
      org: acmeOrg,
      role: OrganizationMemberRole.MEMBER,
    },
    {
      email: 'dave@acme.com',
      firstName: 'Dave',
      lastName: 'Viewer',
      org: acmeOrg,
      role: OrganizationMemberRole.VIEWER,
    },
    // Beta Inc users (isolated from Acme)
    {
      email: 'eve@beta.com',
      firstName: 'Eve',
      lastName: 'Owner',
      org: betaOrg,
      role: OrganizationMemberRole.OWNER,
    },
  ];

  for (const { email, firstName, lastName, org, role } of users) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash,
        firstName,
        lastName,
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.organizationMember.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
      update: {},
      create: {
        userId: user.id,
        organizationId: org.id,
        role,
      },
    });

    console.log(`✅ User: ${email} (${role} at ${org.name})`);
  }

  // ========================================================
  // Create Root Folders
  // ========================================================
  const aliceUser = await prisma.user.findUniqueOrThrow({ where: { email: 'alice@acme.com' } });
  const eveUser = await prisma.user.findUniqueOrThrow({ where: { email: 'eve@beta.com' } });

  for (const [org, owner] of [[acmeOrg, aliceUser], [betaOrg, eveUser]] as const) {
    const rootFolder = await prisma.folder.upsert({
      where: { id: `00000000-0000-0000-0000-${org.id.replace(/-/g, '').substring(0, 12)}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0000-${org.id.replace(/-/g, '').substring(0, 12)}`,
        organizationId: org.id,
        name: 'Root',
        path: '/',
        createdById: owner.id,
      },
    });
    console.log(`✅ Root folder for ${org.name}: ${rootFolder.id}`);
  }

  console.log('\n🎉 Seed complete!');
  console.log(`\nDefault password for all users: ${DEFAULT_PASSWORD}`);
  console.log('\nTest accounts:');
  console.log('  alice@acme.com  — OWNER  at Acme Corp');
  console.log('  bob@acme.com    — ADMIN  at Acme Corp');
  console.log('  carol@acme.com  — MEMBER at Acme Corp');
  console.log('  dave@acme.com   — VIEWER at Acme Corp');
  console.log('  eve@beta.com    — OWNER  at Beta Inc (separate tenant)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
