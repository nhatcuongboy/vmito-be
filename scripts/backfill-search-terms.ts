/**
 * Standalone equivalent of VenuesService.backfillSearchTerms() /
 * POST /venues/backfill-search-terms (admin endpoint) — rebuilds `searchTerms`
 * for every venue from its current name/address/district/city/newAddress/
 * newDistrict/newCity. Run this after backfilling streetAddress/newAddress
 * (scripts/backfill-street-and-new-address.ts) so the search index picks up
 * the updated newAddress text.
 *
 * Usage
 * -----
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-search-terms.ts
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-search-terms.ts --slug=my-venue
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-search-terms.ts --apply
 *
 * DATABASE_URL controls which database is targeted.
 */
import { PrismaClient, SportType } from '@prisma/client';
import { removeVietnameseTones } from '../src/common/utils/string.utils';

const prisma = new PrismaClient();

const SPORT_PREFIX: Record<SportType, string> = {
  [SportType.BADMINTON]: 'san cau long',
  [SportType.PICKLEBALL]: 'san pickleball',
};

function buildSearchTerms(venue: {
  name: string;
  sportType?: SportType | null;
  address?: string | null;
  district?: string | null;
  city?: string | null;
  newAddress?: string | null;
  newDistrict?: string | null;
  newCity?: string | null;
}): string {
  const prefix = SPORT_PREFIX[venue.sportType ?? SportType.BADMINTON];
  return removeVietnameseTones(
    [
      prefix,
      venue.name,
      venue.address,
      venue.district,
      venue.city,
      venue.newAddress,
      venue.newDistrict,
      venue.newCity,
    ]
      .filter(Boolean)
      .join(' ')
  ).toLowerCase();
}

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
  console.log(slug ? `Scope: venue slug = ${slug}` : 'Scope: ALL venues');

  const venues = await prisma.venue.findMany({
    where: slug ? { slug } : {},
    select: {
      id: true,
      slug: true,
      name: true,
      sportType: true,
      address: true,
      district: true,
      city: true,
      newAddress: true,
      newDistrict: true,
      newCity: true,
      searchTerms: true,
    },
  });

  let updated = 0;
  let unchanged = 0;

  for (const venue of venues) {
    const searchTerms = buildSearchTerms(venue);
    if (searchTerms === venue.searchTerms) {
      unchanged++;
      continue;
    }
    console.log(`${apply ? 'UPDATE' : 'WOULD UPDATE'} ${venue.slug ?? venue.id}`);
    if (apply) {
      await prisma.venue.update({ where: { id: venue.id }, data: { searchTerms } });
    }
    updated++;
  }

  console.log('---');
  console.log(`Venues checked: ${venues.length}`);
  console.log(`${apply ? 'Updated' : 'Would update'}:  ${updated}`);
  console.log(`Unchanged:      ${unchanged}`);
  if (!apply && updated > 0) {
    console.log('Re-run with --apply to write these changes.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
