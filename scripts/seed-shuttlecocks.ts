/**
 * Seed the `shuttlecocks` table from SEED_SHUTTLECOCKS
 * (src/shuttlecocks/shuttlecocks.data.ts).
 *
 * Idempotent, keyed by `slug`:
 *   - slug missing in DB  -> row is created (keeping the seed id)
 *   - slug already in DB  -> skipped, so admin edits are never overwritten
 *                            (pass --overwrite to reset it to the seed values)
 *
 * Usage
 * -----
 *   npx ts-node -r tsconfig-paths/register scripts/seed-shuttlecocks.ts            # dry run
 *   npx ts-node -r tsconfig-paths/register scripts/seed-shuttlecocks.ts --apply
 *   npx ts-node -r tsconfig-paths/register scripts/seed-shuttlecocks.ts --apply --overwrite
 *
 * DATABASE_URL controls which database is targeted (host is printed first).
 */
import { PrismaClient } from '@prisma/client';
import { toShuttlecockCreateInput } from '../src/shuttlecocks/shuttlecocks.mapper';
import { SEED_SHUTTLECOCKS } from '../src/shuttlecocks/shuttlecocks.data';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const overwrite = args.includes('--overwrite');

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const u = new URL(dbUrl);
      console.log(`Database: ${u.host}${u.pathname}`);
    } catch {
      console.log('Database: (could not parse DATABASE_URL)');
    }
  }
  console.log(apply ? 'Mode: APPLY' : 'Mode: DRY RUN (pass --apply to write)');

  const existing = await prisma.shuttlecock.findMany({
    select: { slug: true },
  });
  const existingSlugs = new Set(existing.map((r) => r.slug));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of SEED_SHUTTLECOCKS) {
    const exists = existingSlugs.has(item.slug);

    if (exists && !overwrite) {
      skipped++;
      console.log(`  skip    ${item.slug}`);
      continue;
    }

    const { slug: _slug, ...updateData } = toShuttlecockCreateInput(item);
    console.log(`  ${exists ? 'update ' : 'create '} ${item.slug}`);

    if (apply) {
      await prisma.shuttlecock.upsert({
        where: { slug: item.slug },
        create: { ...toShuttlecockCreateInput(item), id: item.id },
        update: updateData,
      });
    }
    if (exists) updated++;
    else created++;
  }

  console.log(
    `\n${apply ? 'Done' : 'Would do'}: ${created} created, ${updated} updated, ${skipped} skipped ` +
      `(seed total ${SEED_SHUTTLECOCKS.length}).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
