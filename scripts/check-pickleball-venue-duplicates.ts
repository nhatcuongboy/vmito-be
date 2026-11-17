/**
 * Check a pickleball import CSV (output of the HCM normalisation, i.e. the
 * bulk-import-venues.ts format) against venues already in the DB, to find
 * pickleball rows that are the SAME PLACE (same address / phone / location)
 * or a BRANCH of the same brand as an existing (badminton) venue — before
 * importing them as brand-new venues.
 *
 * Read-only: works purely on two CSV files, never connects to a database.
 *
 * Step 1 — export venues from production (read-only query), e.g. with psql:
 *
 *   \copy (SELECT id, slug, name, "sportType",
 *            array_to_string("sportTypes", ';') AS "sportTypes",
 *            status, "closureStatus", address, "streetAddress", "wardOld",
 *            district, city, "newDistrict", "newCity", "newAddress",
 *            phone, lat, lng, "placeId", "locatedWithin"
 *          FROM venues) TO 'prod_venues.csv' WITH CSV HEADER
 *
 * Step 2 — run the check:
 *
 *   npx ts-node -r tsconfig-paths/register scripts/check-pickleball-venue-duplicates.ts \
 *     --candidates=san_pickleball_hcm_import.csv --existing=prod_venues.csv \
 *     [--out=pickleball-duplicate-report.csv] [--all-cities]
 *
 * Match types (one row per candidate/existing pair in the report):
 *   SAME_ADDRESS  HIGH    same house number + street (and same new ward when both known;
 *                         required for generic streets like "Đường số 9")
 *   SAME_PHONE    HIGH    a phone number in common
 *   NEAR_GEO      HIGH    both have lat/lng, <= 80 m apart (only if the candidate CSV has lat/lng)
 *   SAME_LOT      MEDIUM  same base house number + street, different suffix/alley
 *                         ("189 Cống Quỳnh" vs "189B/A30 Cống Quỳnh")
 *   SAME_BRAND    LOW     brand words of the names overlap (possible branch elsewhere)
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  brandSimilarity,
  brandTokens,
  distanceMeters,
  loadPlaceNames,
  norm,
  parseStreet,
  phonesOf,
  readCsv,
  StreetKey,
  toCsvCell,
  wardKey,
} from './lib/venue-match.util';

const HCM_AREA = /ho chi minh|hcm|sai gon|binh duong|ba ria|vung tau|thu duc/;
const BRAND_THRESHOLD = 0.5;
const GEO_METERS = 80;

interface Venue {
  row: number;
  raw: Record<string, string>;
  name: string;
  street: StreetKey | null;
  ward: string;
  phones: string[];
  brand: string[];
  lat?: number;
  lng?: number;
}

interface Match {
  candidate: Venue;
  existing: Venue;
  type: string;
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  detail: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
  return {
    candidates: get('candidates') ?? 'san_pickleball_hcm_import.csv',
    existing: get('existing') ?? 'prod_venues.csv',
    out: get('out') ?? 'pickleball-duplicate-report.csv',
    allCities: args.includes('--all-cities'),
  };
}

function toVenue(raw: Record<string, string>, row: number, places: string[]): Venue {
  const lat = parseFloat(raw.lat);
  const lng = parseFloat(raw.lng);
  return {
    row,
    raw,
    name: raw.name,
    street: parseStreet(raw.streetAddress || raw.address),
    ward: wardKey(raw.newDistrict),
    phones: phonesOf(raw.phone, raw.description),
    brand: brandTokens(raw.name, places),
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
  };
}

function compare(c: Venue, e: Venue): Match[] {
  const found: Match[] = [];
  const add = (type: string, level: Match['level'], detail: string) =>
    found.push({ candidate: c, existing: e, type, level, detail });
  const wardsKnown = Boolean(c.ward && e.ward);
  const wardOk = !wardsKnown || c.ward === e.ward;

  if (c.street && e.street && c.street.street === e.street.street) {
    const wardRequired = c.street.generic || e.street.generic;
    if (wardOk && (!wardRequired || (wardsKnown && c.ward === e.ward))) {
      if (c.street.house === e.street.house) {
        add('SAME_ADDRESS', 'HIGH', `${c.street.house} ${c.street.street}${wardsKnown ? ` (${c.ward})` : ', DB chưa có newDistrict'}`);
      } else if (c.street.baseHouse === e.street.baseHouse) {
        add('SAME_LOT', 'MEDIUM', `${c.street.house} vs ${e.street.house} ${c.street.street}`);
      }
    }
  }
  const sharedPhones = c.phones.filter((p) => e.phones.includes(p));
  if (sharedPhones.length) add('SAME_PHONE', 'HIGH', sharedPhones.join('; '));
  if (c.lat !== undefined && e.lat !== undefined) {
    const d = distanceMeters(c.lat, c.lng!, e.lat, e.lng!);
    if (d <= GEO_METERS) add('NEAR_GEO', 'HIGH', `${Math.round(d)} m`);
  }
  const sim = brandSimilarity(c.brand, e.brand);
  if (sim >= BRAND_THRESHOLD) {
    add('SAME_BRAND', 'LOW', `[${c.brand.join(' ')}] ~ [${e.brand.join(' ')}] = ${sim.toFixed(2)}`);
  }
  return found;
}

function suggestion(matches: Match[]): string {
  const e = matches[0].existing.raw;
  const sports = (e.sportTypes || e.sportType || '').toUpperCase();
  const samePlace = matches.some((m) => m.level !== 'LOW');
  if (!samePlace) return 'Có thể là chi nhánh khác — kiểm tra tay';
  if (sports.includes('PICKLEBALL')) return 'Đã có trong DB (đã có PICKLEBALL) — bỏ khỏi file import';
  return 'Cùng địa điểm — cân nhắc thêm PICKLEBALL vào sportTypes của venue hiện có thay vì tạo mới';
}

function main() {
  const opts = parseArgs();
  for (const f of [opts.candidates, opts.existing]) {
    if (!fs.existsSync(f)) throw new Error(`File not found: ${f}`);
  }
  const places = loadPlaceNames(path.resolve(__dirname, '..', 'admin_mapping_old_to_new_10_25.csv'));
  const candidates = readCsv(opts.candidates).map((r, i) => toVenue(r, i + 2, places));
  const existing = readCsv(opts.existing)
    .map((r, i) => toVenue(r, i + 2, places))
    .filter((v) => opts.allCities || HCM_AREA.test(norm([v.raw.city, v.raw.newCity, v.raw.address, v.raw.newAddress].join(' '))));
  console.log(`Candidates: ${candidates.length} | existing venues compared: ${existing.length}${opts.allCities ? '' : ' (HCM area only)'}`);

  const header = ['level', 'matchType', 'suggestion', 'candidateRow', 'candidateName', 'candidateAddress', 'candidatePhone',
    'existingId', 'existingSlug', 'existingName', 'existingSportTypes', 'existingStatus', 'existingAddress', 'existingNewAddress', 'existingPhone', 'detail'];
  const lines = [header.join(',')];
  const byLevel = { HIGH: new Set<number>(), MEDIUM: new Set<number>(), LOW: new Set<number>() };
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  for (const c of candidates) {
    const pairs = existing.map((e) => compare(c, e)).filter((m) => m.length);
    pairs.sort((a, b) => Math.min(...a.map((m) => rank[m.level])) - Math.min(...b.map((m) => rank[m.level])));
    for (const matches of pairs) {
      const level = matches.reduce((best, m) => (rank[m.level] < rank[best] ? m.level : best), 'LOW' as Match['level']);
      byLevel[level].add(c.row);
      const e = matches[0].existing.raw;
      lines.push([level, matches.map((m) => m.type).join('+'), suggestion(matches), c.row, c.name, c.raw.address, c.raw.phone,
        e.id, e.slug, e.name, e.sportTypes || e.sportType, `${e.status ?? ''}/${e.closureStatus ?? ''}`, e.address, e.newAddress, e.phone,
        matches.map((m) => `${m.type}: ${m.detail}`).join(' | ')].map(toCsvCell).join(','));
    }
  }
  fs.writeFileSync(opts.out, lines.join('\n') + '\n', 'utf-8');

  const medium = [...byLevel.MEDIUM].filter((r) => !byLevel.HIGH.has(r));
  const low = [...byLevel.LOW].filter((r) => !byLevel.HIGH.has(r) && !byLevel.MEDIUM.has(r));
  console.log('---');
  console.log(`HIGH   (gần như chắc trùng địa điểm): ${byLevel.HIGH.size} dòng`);
  console.log(`MEDIUM (cùng số nhà gốc/cùng hẻm):     ${medium.length} dòng`);
  console.log(`LOW    (chỉ trùng thương hiệu):         ${low.length} dòng`);
  console.log(`Không trùng:                             ${candidates.length - byLevel.HIGH.size - medium.length - low.length} dòng`);
  console.log(`Report: ${opts.out} (${lines.length - 1} cặp)`);
}

main();
