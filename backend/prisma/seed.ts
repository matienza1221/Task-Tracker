import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env';
import { hashPassword, validatePasswordStrength } from '../src/lib/password';
import { seedBaseData } from '../src/lib/seedData';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const summary = await seedBaseData(prisma);
  // eslint-disable-next-line no-console
  console.log('[seed] Vocabularies and permissions:', summary);

  const email = env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.log('[seed] SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin creation.');
    return;
  }

  const existing = await prisma.user.findFirst({ where: { email, deletedAt: null } });

  if (existing) {
    if (existing.globalRole !== 'ADMIN') {
      await prisma.user.update({ where: { id: existing.id }, data: { globalRole: 'ADMIN' } });
      // eslint-disable-next-line no-console
      console.log(`[seed] Existing user ${email} promoted to ADMIN. Password left unchanged.`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[seed] Admin ${email} already exists. Nothing to do.`);
    }
    return;
  }

  const problems = validatePasswordStrength(password, { email });
  if (problems.length > 0) {
    throw new Error(`SEED_ADMIN_PASSWORD does not meet password requirements:\n  - ${problems.join('\n  - ')}`);
  }

  await prisma.user.create({
    data: {
      email,
      displayName: 'Administrator',
      passwordHash: await hashPassword(password),
      globalRole: 'ADMIN',
      timezone: env.SEED_TIMEZONE,
      isActive: true,
      // The bootstrap password comes from the environment; force a change on first sign-in.
      mustChangePassword: true,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`[seed] Created admin account ${email} (must change password on first sign-in).`);
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[seed] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
