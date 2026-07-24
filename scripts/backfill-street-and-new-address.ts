/**
 * Backfill Venue.streetAddress / Venue.wardOld (extracted from the free-text
 * `address` column) and recompute Venue.newAddress so it includes the street
 * portion instead of just "ward, city" — the old resolve() algorithm never
 * included it (see AddressMappingService.resolve()).
 *
 * Two passes, both idempotent:
 *
 *   1. Every venue: extract streetAddress/wardOld from `address` if not
 *      already set.
 *   2. Venues that already have newDistrict/newCity: recompute newAddress
 *      from the (now-available) streetAddress + newDistrict + newCity.
 *
 * IMPORTANT — run order: pass 2 trusts newDistrict/newCity as correct. Those
 * columns used to be free-text and may contain typos or stale values. Review
 * the dry-run output and fix any suspicious newDistrict/newCity via the admin
 * UI dropdown *before* running with --apply, otherwise this script bakes a
 * correct street onto an already-wrong ward/city.
 *
 * Usage
 * -----
 *   # dry run over all venues (default — no writes)
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-street-and-new-address.ts
 *
 *   # dry run for a single venue
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-street-and-new-address.ts --slug=my-venue
 *
 *   # actually apply the changes
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-street-and-new-address.ts --apply
 *
 * DATABASE_URL controls which database is targeted. Point it at the right
 * environment (local / staging / production) before running with --apply.
 */
import { PrismaClient } from '@prisma/client';
import { AddressMappingService } from '../src/venues/address-mapping.service';

const prisma = new PrismaClient();
const addressMapping = new AddressMappingService();

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
    orderBy: { createdAt: 'asc' },
  });

  let streetSet = 0;
  let streetSkipped = 0;
  let newAddressUpdated = 0;
  let newAddressUnchanged = 0;
  let noNewWardCityYet = 0;

  for (const venue of venues) {
    const data: {
      streetAddress?: string;
      wardOld?: string | null;
      newAddress?: string;
    } = {};

    // Pass 1: extract streetAddress / wardOld once.
    let streetAddress = venue.streetAddress;
    if (streetAddress == null) {
      const extracted = addressMapping.extractStreetAndWard(venue.address);
      streetAddress = extracted.streetAddress;
      data.streetAddress = extracted.streetAddress;
      data.wardOld = extracted.wardOld;
      streetSet++;
    } else {
      streetSkipped++;
    }

    // Pass 2: recompute newAddress for venues that already have new-era ward/city.
    if (venue.newDistrict || venue.newCity) {
      const composed = [streetAddress, venue.newDistrict, venue.newCity]
        .filter(Boolean)
        .join(', ');
      if (composed && composed !== venue.newAddress) {
        console.log(
          `${apply ? 'UPDATE' : 'WOULD UPDATE'} ${venue.slug ?? venue.id}: newAddress\n` +
            `  before: ${venue.newAddress ?? '(null)'}\n` +
            `  after:  ${composed}`
        );
        data.newAddress = composed;
        newAddressUpdated++;
      } else {
        newAddressUnchanged++;
      }
    } else {
      noNewWardCityYet++;
    }

    if (apply && Object.keys(data).length > 0) {
      await prisma.venue.update({ where: { id: venue.id }, data });
    }
  }

  console.log('---');
  console.log(`Venues checked:              ${venues.length}`);
  console.log(`streetAddress/wardOld set:   ${streetSet}`);
  console.log(`streetAddress already set:   ${streetSkipped}`);
  console.log(
    `${apply ? 'newAddress updated' : 'newAddress would update'}:   ${newAddressUpdated}`
  );
  console.log(`newAddress already correct:  ${newAddressUnchanged}`);
  console.log(`No new ward/city yet:        ${noNewWardCityYet}`);
  if (!apply && streetSet + newAddressUpdated > 0) {
    console.log('Re-run with --apply to write these changes.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
