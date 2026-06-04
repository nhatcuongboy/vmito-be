/**
 * Backfill correct playoff `round` labels for elimination brackets that were
 * generated BEFORE the determineRoundNames fix (commit a4aab42).
 *
 * Background
 * ----------
 * The old `determineRoundNames` used `unshift`, producing e.g. ['F','SF'] for a
 * 4-team bracket. The first round (2 matches) was therefore labeled 'F' and the
 * final (1 match) 'SF' — fully inverted. The public bracket renders columns and
 * labels purely from the stored `round` string, so affected tournaments show the
 * semifinal/final matches in the wrong columns.
 *
 * `matchNumber` was always assigned in structural order (first round = lowest
 * numbers), so we can recompute the correct `round` for every elimination match
 * from the bracket size and each match's position — independent of whatever the
 * (possibly scrambled) stored string says. Running this on already-correct
 * brackets is a no-op, so it is safe to run over everything.
 *
 * The 3rd-place match ('3RD') is never touched.
 *
 * Usage
 * -----
 *   # dry run over all tournaments (default — no writes)
 *   npx ts-node -r tsconfig-paths/register scripts/fix-playoff-round-names.ts
 *
 *   # dry run for a single tournament
 *   npx ts-node -r tsconfig-paths/register scripts/fix-playoff-round-names.ts --slug=giai-noi-bo-cs-badminton-2026-ban-sao
 *
 *   # actually apply the changes
 *   npx ts-node -r tsconfig-paths/register scripts/fix-playoff-round-names.ts --slug=... --apply
 *
 * DATABASE_URL controls which database is targeted. Point it at the right
 * environment (local / staging / production) before running with --apply.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const THIRD_PLACE_ROUND = '3RD';

/** Mirror of CategoriesService.determineRoundNames (the fixed `push` version). */
function determineRoundNames(totalRounds: number): string[] {
  const names: string[] = [];
  for (let i = totalRounds - 1; i >= 0; i--) {
    const matchesInRound = Math.pow(2, i);
    if (matchesInRound === 1) names.push('F');
    else if (matchesInRound === 2) names.push('SF');
    else if (matchesInRound === 4) names.push('QF');
    else names.push(`R${matchesInRound * 2}`);
  }
  return names;
}

function isPowerOf2(n: number): boolean {
  return n >= 1 && (n & (n - 1)) === 0;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string) =>
    args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  return {
    apply: args.includes('--apply'),
    slug: get('slug'),
    tournamentId: get('tournamentId'),
  };
}

async function main() {
  const { apply, slug, tournamentId } = parseArgs();
  console.log(
    `Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}`
  );
  if (slug) console.log(`Scope: tournament slug = ${slug}`);
  else if (tournamentId) console.log(`Scope: tournament id = ${tournamentId}`);
  else console.log('Scope: ALL tournaments');

  const where = slug
    ? { slug }
    : tournamentId
      ? { id: tournamentId }
      : {};

  const tournaments = await prisma.tournament.findMany({
    where,
    select: { id: true, name: true, slug: true, categories: { select: { id: true, name: true } } },
  });

  if (tournaments.length === 0) {
    console.log('No matching tournaments found.');
    return;
  }

  let totalUpdated = 0;
  let categoriesChanged = 0;
  let categoriesSkipped = 0;

  for (const t of tournaments) {
    for (const c of t.categories) {
      // Elimination matches only: not group matches, not group-bound.
      const matches = await prisma.categoryMatch.findMany({
        where: { categoryId: c.id, groupId: null, round: { not: 'GROUP' } },
        orderBy: { matchNumber: 'asc' },
        select: { id: true, round: true, matchNumber: true },
      });

      const mainMatches = matches.filter((m) => m.round !== THIRD_PLACE_ROUND);
      if (mainMatches.length === 0) continue;

      const bracketSize = mainMatches.length + 1; // single-elim: B teams → B-1 matches
      if (!isPowerOf2(bracketSize)) {
        console.warn(
          `  [SKIP] ${t.slug} / ${c.name}: ${mainMatches.length} main matches → bracketSize ${bracketSize} is not a power of 2; needs manual review.`
        );
        categoriesSkipped++;
        continue;
      }

      const totalRounds = Math.log2(bracketSize);
      const roundNames = determineRoundNames(totalRounds);

      // Assign correct round per structural position: first round gets the most
      // matches (lowest matchNumbers), then each later round halves.
      const updates: { id: string; from: string; to: string; matchNumber: number }[] = [];
      let cursor = 0;
      for (let round = 0; round < totalRounds; round++) {
        const matchesInRound = bracketSize / Math.pow(2, round + 1);
        for (let i = 0; i < matchesInRound; i++) {
          const m = mainMatches[cursor++];
          if (m.round !== roundNames[round]) {
            updates.push({
              id: m.id,
              from: m.round,
              to: roundNames[round],
              matchNumber: m.matchNumber,
            });
          }
        }
      }

      if (updates.length === 0) continue;

      categoriesChanged++;
      console.log(
        `\n  ${t.slug} / ${c.name} (bracketSize=${bracketSize}, ${updates.length} match(es) to fix):`
      );
      for (const u of updates) {
        console.log(`    #${u.matchNumber}: ${u.from} → ${u.to}`);
      }

      if (apply) {
        await prisma.$transaction(
          updates.map((u) =>
            prisma.categoryMatch.update({
              where: { id: u.id },
              data: { round: u.to },
            })
          )
        );
        totalUpdated += updates.length;
      }
    }
  }

  console.log('\n────────────────────────────────────────');
  console.log(`Categories with changes: ${categoriesChanged}`);
  if (categoriesSkipped > 0)
    console.log(`Categories skipped (non power-of-2): ${categoriesSkipped}`);
  if (apply) console.log(`Matches updated: ${totalUpdated}`);
  else
    console.log(
      'Dry run only — re-run with --apply (and the right DATABASE_URL) to write these changes.'
    );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
