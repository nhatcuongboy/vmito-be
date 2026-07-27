/**
 * Bulk-import badminton venues from a CSV file by calling the real
 * `VenuesService.create()` through a standalone Nest application context
 * (bootstrapped from `VenuesModule` alone — no need to spin up the full app).
 *
 * Going through the actual service — instead of raw SQL / a bare
 * PrismaClient insert — means every venue is fully normalized at creation
 * time: unique `slug` (VenuesService.generateUniqueSlug), `streetAddress` /
 * `wardOld` / `newDistrict` / `newCity` / `newAddress`
 * (AddressMappingService.extractStreetAndWard/resolve), and `searchTerms`
 * (VenuesService.buildSearchTerms). No separate backfill pass is needed
 * afterwards, unlike a raw-SQL bulk insert.
 *
 * CSV format
 * ----------
 * First row = header, using the same field names as CreateVenueDto
 * (src/venues/dto/create-venue.dto.ts). Required columns: name, address.
 * Recommended: district, city (needed for the old->new admin-unit address
 * resolution to succeed). Any other CreateVenueDto field is optional.
 *
 * Multi-value fields (images, imagePublicIds) use `;` as the in-cell
 * separator since `,` is the CSV delimiter.
 *
 * Fields are quoted-CSV aware (embedded commas/quotes inside a
 * double-quoted cell are handled), since Vietnamese addresses routinely
 * contain commas.
 *
 * Example header:
 *   name,address,district,city,phone,numberOfCourts,hourlyRateWalkIn
 *
 * Usage
 * -----
 *   # dry run (default — no writes, just validates + previews)
 *   npx ts-node -r tsconfig-paths/register scripts/bulk-import-venues.ts --file=venues-import.csv
 *
 *   # actually create the venues
 *   npx ts-node -r tsconfig-paths/register scripts/bulk-import-venues.ts --file=venues-import.csv --apply
 *
 * DATABASE_URL controls which database is targeted. Point it at the right
 * environment (local / staging / production) before running with --apply.
 */
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import { VenuesModule } from '../src/venues/venues.module';
import { VenuesService } from '../src/venues/venues.service';
import { CreateVenueDto } from '../src/venues/dto/create-venue.dto';
import { SportType, VenueStatus, ClosureStatus } from '@prisma/client';

const NUMBER_FIELDS = new Set([
  'lat',
  'lng',
  'numberOfCourts',
  'hourlyRateFixed',
  'hourlyRateWalkIn',
]);
const BOOLEAN_FIELDS = new Set(['isVerified', 'hasCarParking', 'hasCanteen']);
const LIST_FIELDS = new Set(['images', 'imagePublicIds']);

// Columns accepted by CreateVenueDto (src/venues/dto/create-venue.dto.ts).
// Unlike the HTTP path, calling VenuesService.create() directly skips
// Nest's ValidationPipe({ whitelist: true }), so any unrecognized CSV
// column (e.g. a source "no"/index column) would otherwise flow straight
// into Prisma's `data` object and fail with "Unknown argument" at insert
// time. Filter to this whitelist instead of trusting the CSV header as-is.
const KNOWN_FIELDS = new Set([
  'placeId',
  'name',
  'sportType',
  'acronym',
  'description',
  'address',
  'lat',
  'lng',
  'district',
  'city',
  'newDistrict',
  'newCity',
  'isVerified',
  'openingHours',
  'numberOfCourts',
  'status',
  'phone',
  'website',
  'hourlyRateFixed',
  'hourlyRateWalkIn',
  'hasCarParking',
  'hasCanteen',
  'wifiName',
  'wifiPassword',
  'closureStatus',
  'bookingPolicy',
  'locatedWithin',
  'coverPhoto',
  'coverPhotoPublicId',
  'courtLayoutImage',
  'courtLayoutImagePublicId',
  'logo',
  'logoPublicId',
  'images',
  'imagePublicIds',
]);

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string) =>
    args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  return {
    apply: args.includes('--apply'),
    file: get('file') ?? 'venues-import.csv',
  };
}

/** Minimal quoted-CSV parser: handles embedded commas and "" escaping. */
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function rowsToVenues(rows: string[][]): Record<string, unknown>[] {
  const [header, ...dataRows] = rows;
  const columns = header.map((h) => h.trim());

  const unknownColumns = columns.filter((col) => !KNOWN_FIELDS.has(col));
  if (unknownColumns.length > 0) {
    console.warn(
      `Ignoring unrecognized CSV column(s) (not part of CreateVenueDto): ${unknownColumns.join(', ')}`
    );
  }

  return dataRows.map((cells) => {
    const record: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      if (!KNOWN_FIELDS.has(col)) return;
      const raw = cells[i]?.trim();
      if (!raw) return; // omit empty cells so DB/DTO defaults apply

      if (NUMBER_FIELDS.has(col)) {
        record[col] = Number(raw);
      } else if (BOOLEAN_FIELDS.has(col)) {
        record[col] = raw.toLowerCase() === 'true' || raw === '1';
      } else if (LIST_FIELDS.has(col)) {
        record[col] = raw.split(';').map((v) => v.trim()).filter(Boolean);
      } else {
        record[col] = raw;
      }
    });
    return record;
  });
}

function validateRow(
  row: Record<string, unknown>,
  index: number
): string[] {
  const errors: string[] = [];
  if (!row.name) errors.push('missing "name"');
  if (!row.address) errors.push('missing "address"');
  const sportType = row.sportType as string | undefined;
  const status = row.status as string | undefined;
  const closureStatus = row.closureStatus as string | undefined;
  if (sportType && !(sportType in SportType)) {
    errors.push(`invalid sportType "${sportType}"`);
  }
  if (status && !(status in VenueStatus)) {
    errors.push(`invalid status "${status}"`);
  }
  if (closureStatus && !(closureStatus in ClosureStatus)) {
    errors.push(`invalid closureStatus "${closureStatus}"`);
  }
  return errors.map((e) => `Row ${index + 2}: ${e}`); // +2 = 1-index + header row
}

async function main() {
  const { apply, file } = parseArgs();
  console.log(
    `Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}`
  );
  console.log(`Source file: ${file}`);

  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  const rows = parseCsv(fs.readFileSync(file, 'utf-8'));
  if (rows.length < 2) {
    console.error('CSV has no data rows (only header or empty).');
    process.exitCode = 1;
    return;
  }

  const venues = rowsToVenues(rows);
  console.log(`Parsed ${venues.length} venue row(s) from CSV.\n`);

  const allErrors = venues.flatMap((row, i) => validateRow(row, i));
  if (allErrors.length > 0) {
    console.error('Validation errors — fix the CSV and re-run:');
    allErrors.forEach((e) => console.error(`  - ${e}`));
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(VenuesModule, {
    logger: ['error', 'warn'],
  });
  const venuesService = app.get(VenuesService);

  let created = 0;
  let failed = 0;

  for (const [i, row] of venues.entries()) {
    const dto = row as unknown as CreateVenueDto;
    if (!apply) {
      console.log(
        `WOULD CREATE [${i + 1}/${venues.length}]: ${dto.name} — ${dto.address}`
      );
      continue;
    }
    try {
      const venue = await venuesService.create(dto);
      console.log(
        `Created [${i + 1}/${venues.length}]: ${venue.slug ?? venue.id} (${venue.name})`
      );
      created++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `FAILED [${i + 1}/${venues.length}]: ${dto.name} — ${message}`
      );
      failed++;
    }
  }

  await app.close();

  console.log('---');
  console.log(`Total rows:   ${venues.length}`);
  if (apply) {
    console.log(`Created:      ${created}`);
    console.log(`Failed:       ${failed}`);
  } else {
    console.log('Re-run with --apply to actually create these venues.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
