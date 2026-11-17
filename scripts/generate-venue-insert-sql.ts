/**
 * Generate a self-contained SQL file that inserts venues from a CSV (the
 * bulk-import-venues.ts format), for running in a SQL client such as
 * DBeaver when the TS import script can't reach the target database.
 *
 * Every derived column is computed with the SAME helpers VenuesService.create()
 * uses, so rows are indistinguishable from venues created through the API:
 *   - streetAddress / wardOld  AddressMappingService.extractStreetAndWard
 *   - newDistrict / newCity    explicit CSV value, else AddressMappingService.resolve
 *   - newAddress               streetAddress + newDistrict + newCity
 *   - slug                     generateSlug("<sport prefix> <name>"), random suffix on collision
 *   - searchTerms              buildVenueSearchTerms
 * Slug collisions are checked against an export of the target DB's slugs
 * (--existing, any CSV with a `slug` column) and within the file itself.
 *
 * The output runs as ONE transaction and is safe to re-run: a row whose slug
 * already exists is skipped (ON CONFLICT (slug) DO NOTHING). A companion
 * *.rollback.sql deletes exactly the ids generated here.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/generate-venue-insert-sql.ts \
 *     --file=venues.csv --existing=prod_venues.csv --out=venues_insert.sql [--rows=2,5,9]
 */
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { SportType } from '@prisma/client';
import { generateSlug } from '../src/common/utils/string.utils';
import { AddressMappingService } from '../src/venues/address-mapping.service';
import {
  buildVenueSearchTerms,
  SPORT_PREFIX,
} from '../src/venues/venue-search-terms.util';
import { readCsv } from './lib/venue-match.util';

// Plain text columns copied straight from the CSV when present.
const TEXT_COLUMNS = [
  'placeId', 'acronym', 'description', 'openingHours', 'phone', 'website',
  'bookingPolicy', 'locatedWithin', 'coverPhoto', 'logo',
];
const NUMBER_COLUMNS = ['lat', 'lng', 'numberOfCourts', 'hourlyRateFixed', 'hourlyRateWalkIn'];

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
  const rows = get('rows');
  return {
    file: get('file') ?? 'venues.csv',
    existing: get('existing'),
    out: get('out') ?? 'venues_insert.sql',
    rows: rows ? new Set(rows.split(',').map(Number)) : null, // CSV line numbers (header = 1)
  };
}

const lit = (v: string | null | undefined) =>
  v === null || v === undefined || v === '' ? 'NULL' : `'${v.replace(/'/g, "''")}'`;

function sportSelection(raw: Record<string, string>) {
  const list = (raw.sportTypes || raw.sportType || SportType.BADMINTON)
    .split(';').map((s) => s.trim()).filter(Boolean) as SportType[];
  for (const s of list) {
    if (!(s in SportType)) throw new Error(`Invalid sport type "${s}" for "${raw.name}"`);
  }
  const sportTypes = Array.from(new Set(list));
  const requested = raw.sportType as SportType | undefined;
  const sportType = requested && sportTypes.includes(requested) ? requested : sportTypes[0];
  return { sportType, sportTypes };
}

function main() {
  const opts = parseArgs();
  const mapping = new AddressMappingService();
  mapping.onModuleInit(); // loads admin_mapping_old_to_new_10_25.csv from the project root

  const taken = new Set<string>(
    opts.existing ? readCsv(opts.existing).map((r) => r.slug).filter(Boolean) : []
  );
  console.log(`Existing slugs loaded: ${taken.size}`);

  const rows = readCsv(opts.file)
    .map((raw, i) => ({ raw, line: i + 2 }))
    .filter(({ line }) => !opts.rows || opts.rows.has(line));

  const statements: string[] = [];
  const ids: string[] = [];
  const summary: string[] = [];

  for (const { raw, line } of rows) {
    if (!raw.name || !raw.address) throw new Error(`Line ${line}: name and address are required`);
    const district = raw.district?.trim() || null;
    const city = raw.city?.trim() || null;
    const { streetAddress, wardOld } = mapping.extractStreetAndWard(raw.address, district ?? '', city ?? '');

    let newDistrict = raw.newDistrict || undefined;
    let newCity = raw.newCity || undefined;
    if (!newDistrict && !newCity) {
      const resolved = mapping.resolve(raw.address, district ?? '', city ?? '', streetAddress);
      newDistrict = resolved?.newDistrict;
      newCity = resolved?.newCity;
    }
    const newAddress = newDistrict || newCity
      ? [streetAddress, newDistrict, newCity].filter(Boolean).join(', ')
      : null;

    const { sportType, sportTypes } = sportSelection(raw);
    const base = generateSlug(`${SPORT_PREFIX[sportType].label} ${raw.name}`);
    let slug = base;
    while (taken.has(slug)) slug = `${base}-${Math.random().toString(36).substring(2, 7)}`;
    taken.add(slug);

    const searchTerms = buildVenueSearchTerms({
      name: raw.name, sportType, sportTypes, address: raw.address,
      district, city, newAddress, newDistrict, newCity,
    });

    const id = randomUUID();
    ids.push(id);
    const cols: [string, string][] = [
      ['id', lit(id)],
      ['slug', lit(slug)],
      ['name', lit(raw.name)],
      ['sportType', `${lit(sportType)}::"SportType"`],
      ['sportTypes', `ARRAY[${sportTypes.map(lit).join(', ')}]::"SportType"[]`],
      ['address', lit(raw.address)],
      ['streetAddress', lit(streetAddress)],
      ['wardOld', lit(wardOld)],
      ['district', lit(district)],
      ['city', lit(city)],
      ['newAddress', lit(newAddress)],
      ['newDistrict', lit(newDistrict)],
      ['newCity', lit(newCity)],
      ['searchTerms', lit(searchTerms)],
      ...TEXT_COLUMNS.filter((c) => raw[c]).map((c): [string, string] => [c, lit(raw[c])]),
      ...NUMBER_COLUMNS.filter((c) => raw[c] && Number.isFinite(Number(raw[c])))
        .map((c): [string, string] => [c, String(Number(raw[c]))]),
      ['createdAt', 'NOW()'],
      ['updatedAt', 'NOW()'],
    ];
    statements.push(
      `-- line ${line}: ${raw.name.replace(/\n/g, ' ')}\n` +
      `INSERT INTO "venues" (${cols.map(([c]) => `"${c}"`).join(', ')})\n` +
      `VALUES (${cols.map(([, v]) => v).join(', ')})\nON CONFLICT ("slug") DO NOTHING;`
    );
    summary.push(`${slug} | ${newAddress ?? raw.address}`);
  }

  const idList = ids.map(lit).join(',\n  ');
  const header = `-- Generated by scripts/generate-venue-insert-sql.ts on ${new Date().toISOString()}\n` +
    `-- Source: ${opts.file} (${ids.length} venues)\n` +
    `-- Runs as one transaction. Re-running is safe: existing slugs are skipped.\n`;
  fs.writeFileSync(opts.out, [
    header,
    'BEGIN;\n',
    ...statements.map((s) => s + '\n'),
    `-- Verification: expect inserted = ${ids.length} on the first run (0 on a re-run)`,
    `SELECT COUNT(*) AS inserted FROM "venues" WHERE "id" IN (\n  ${idList}\n);\n`,
    'COMMIT;\n',
  ].join('\n'), 'utf-8');

  const rollbackFile = opts.out.replace(/\.sql$/, '') + '.rollback.sql';
  fs.writeFileSync(rollbackFile,
    `-- Deletes ONLY the venues created by ${opts.out}\nBEGIN;\n` +
    `DELETE FROM "venues" WHERE "id" IN (\n  ${idList}\n);\nCOMMIT;\n`, 'utf-8');

  console.log(`Venues: ${ids.length}`);
  console.log(`SQL:      ${opts.out}`);
  console.log(`Rollback: ${rollbackFile}`);
  summary.slice(0, 5).forEach((s) => console.log(`  ${s}`));
  if (summary.length > 5) console.log(`  ... (${summary.length - 5} more)`);
}

main();
