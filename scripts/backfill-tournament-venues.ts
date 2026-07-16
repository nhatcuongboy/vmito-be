/**
 * Backfill TournamentVenue rows for tournaments whose legacy primary pointer
 * (`tournament.venueId`) has no matching row in `tournament_venues`.
 *
 * Background
 * ----------
 * Historically, creating a tournament (or editing its location in the manage
 * Location panel) only set `tournament.venueId` and never created a
 * TournamentVenue row, so the "Competition venues" tab showed nothing for
 * those tournaments. The write paths now keep both in sync (invariant: a
 * non-null venueId always has a matching TournamentVenue row); this script
 * repairs pre-existing data. Idempotent — tournaments that already have the
 * matching row are skipped, so re-running is safe.
 *
 * Usage
 * -----
 *   # dry run over all tournaments (default — no writes)
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-tournament-venues.ts
 *
 *   # dry run for a single tournament
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-tournament-venues.ts --slug=my-tournament
 *
 *   # actually apply the changes
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-tournament-venues.ts --apply
 *
 * DATABASE_URL controls which database is targeted. Point it at the right
 * environment (local / staging / production) before running with --apply.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string) =>
    args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  return {
    apply: args.includes('--apply'),
    slug: get('slug'),
  };
}

async function main() {
  const { apply, slug } = parseArgs();
  console.log(
    `Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}`
  );
  console.log(
    slug ? `Scope: tournament slug = ${slug}` : 'Scope: ALL tournaments'
  );

  const tournaments = await prisma.tournament.findMany({
    where: {
      venueId: { not: null },
      ...(slug ? { slug } : {}),
    },
    include: {
      tournamentVenues: true,
      venue: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  let consistent = 0;
  let created = 0;
  let skipped = 0;

  for (const t of tournaments) {
    if (!t.venueId) continue;

    if (!t.venue) {
      console.warn(
        `SKIP ${t.slug ?? t.id}: venueId=${t.venueId} dangles (no Venue record)`
      );
      skipped++;
      continue;
    }

    const hasRow = t.tournamentVenues.some((tv) => tv.venueId === t.venueId);
    if (hasRow) {
      consistent++;
      continue;
    }

    console.log(
      `${apply ? 'CREATE' : 'WOULD CREATE'} ${t.slug ?? t.id}: TournamentVenue -> ${t.venue.name}`
    );
    if (apply) {
      await prisma.tournamentVenue.create({
        data: { tournamentId: t.id, venueId: t.venueId },
      });
    }
    created++;
  }

  console.log('---');
  console.log(`Checked:            ${tournaments.length}`);
  console.log(`Already consistent: ${consistent}`);
  console.log(`${apply ? 'Created' : 'Would create'}:       ${created}`);
  console.log(`Skipped (dangling): ${skipped}`);
  if (!apply && created > 0) {
    console.log('Re-run with --apply to write these changes.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
