import { PrismaClient } from '@prisma/client';
import { defaultServicePackages } from '../server/src/db/servicePackages';

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    // Serialize seed runs while preserving the identifiers of existing packages.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(547721510)`;
    for (const pkg of defaultServicePackages) {
      const existing = await tx.servicePackage.findFirst({
        where: { serviceKey: pkg.serviceKey, tier: pkg.tier },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });

      if (existing) {
        await tx.servicePackage.update({ where: { id: existing.id }, data: pkg });
      } else {
        await tx.servicePackage.create({ data: pkg });
      }
    }
  }, { timeout: 30000 });

  console.log(`Seeded ${defaultServicePackages.length} service packages.`);
}

main()
  .catch((error) => {
    console.error('Error seeding database:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
