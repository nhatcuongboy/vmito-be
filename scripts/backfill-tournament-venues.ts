/**
 * Backfill tournament venue data for the TournamentVenue source-of-truth
 * migration. Two passes:
 *
 *   1. Tournaments whose legacy primary pointer (`tournament.venueId`) has no
 *      matching row in `tournament_venues` get the missing linked row.
 *   2. Inline TournamentVenue rows (venueId = null) whose stored `placeId`
 *      matches a directory Venue get linked to it (find-only — no Venue is
 *      ever created). If the tournament then has no primary pointer, it is
 *      pointed at its oldest linked venue.
 *
 * Background
 * ----------
 * Historically, creating a tournament (or editing its location in the manage
 * Location panel) only set `tournament.venueId` and never created a
 * TournamentVenue row, so the "Competition venues" tab showed nothing for
 * those tournaments. Conversely, the venues tab stored every added venue
 * inline even when it existed in the directory, so it could never be chosen
 * as the primary venue. The write paths now keep both in sync (invariant: a
 * non-null venueId always has a matching TournamentVenue row); this script
 * repairs pre-existing data. Idempotent — consistent rows are skipped, so
 * re-running is safe.
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

  // ── Pass 2: link inline rows whose placeId matches a directory venue ────
  const inlineRows = await prisma.tournamentVenue.findMany({
    where: {
      venueId: null,
      placeId: { not: null },
      ...(slug ? { tournament: { slug } } : {}),
    },
    include: {
      tournament: { select: { id: true, slug: true, venueId: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  let linked = 0;
  let inlineKept = 0;
  let linkSkipped = 0;

  for (const tv of inlineRows) {
    if (!tv.placeId) continue;

    const venue = await prisma.venue.findUnique({
      where: { placeId: tv.placeId },
    });
    if (!venue) {
      inlineKept++;
      continue;
    }

    // A linked row for this venue already exists on the tournament — linking
    // this one too would duplicate the pair. Leave it for manual cleanup.
    const duplicate = await prisma.tournamentVenue.findFirst({
      where: { tournamentId: tv.tournamentId, venueId: venue.id },
    });
    if (duplicate) {
      console.warn(
        `SKIP ${tv.tournament.slug ?? tv.tournamentId}: inline "${tv.name}" duplicates linked venue ${venue.name}`
      );
      linkSkipped++;
      continue;
    }

    console.log(
      `${apply ? 'LINK' : 'WOULD LINK'} ${tv.tournament.slug ?? tv.tournamentId}: inline "${tv.name}" -> ${venue.name}`
    );
    if (apply) {
      await prisma.tournamentVenue.update({
        where: { id: tv.id },
        data: { venueId: venue.id },
      });
      if (!tv.tournament.venueId) {
        const oldestLinked = await prisma.tournamentVenue.findFirst({
          where: { tournamentId: tv.tournamentId, venueId: { not: null } },
          orderBy: { createdAt: 'asc' },
        });
        if (oldestLinked?.venueId) {
          await prisma.tournament.update({
            where: { id: tv.tournamentId },
            data: { venueId: oldestLinked.venueId },
          });
          console.log(
            `  SET primary pointer of ${tv.tournament.slug ?? tv.tournamentId} -> ${oldestLinked.venueId}`
          );
        }
      }
    }
    linked++;
  }

  console.log('---');
  console.log(`Pass 1 checked:      ${tournaments.length}`);
  console.log(`Already consistent:  ${consistent}`);
  console.log(`${apply ? 'Created' : 'Would create'}:        ${created}`);
  console.log(`Skipped (dangling):  ${skipped}`);
  console.log(`Pass 2 inline rows:  ${inlineRows.length}`);
  console.log(`${apply ? 'Linked' : 'Would link'}:          ${linked}`);
  console.log(`Kept inline:         ${inlineKept}`);
  console.log(`Skipped (duplicate): ${linkSkipped}`);
  if (!apply && created + linked > 0) {
    console.log('Re-run with --apply to write these changes.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
