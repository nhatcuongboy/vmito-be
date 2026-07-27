/**
 * Clean up a Hanoi-badminton-venue CSV (scraped from Google Maps) so it's
 * ready to feed into scripts/bulk-import-venues.ts.
 *
 * Fixes applied:
 *   1. city — every row gets "Hà Nội" (this dataset is Hanoi-only, per note).
 *   2. address — strips scrape artifacts:
 *      - the literal "(địa chỉ hiển thị không đầy đủ)" tag
 *      - any parenthetical that was truncated by the scraper, i.e. ends in
 *        "...)" (e.g. "(gần nhà hàng Chi...)")
 *      then collapses any resulting double commas / spaces.
 *   3. address — for rows with NO comma at all (dash-separated, e.g.
 *      "Chiến Thắng - Triều Khúc - Thanh Trì - Hà Nội"), converts " - " to
 *      ", " so the comma-based ward/district extraction in
 *      AddressMappingService can actually segment it. Only applied when the
 *      address has zero commas, to avoid mangling addresses that
 *      legitimately contain a hyphen (e.g. "61-63 Phan Trọng Tuệ").
 *   4. district — inferred by matching address segments against the list of
 *      Hanoi districts/huyện from admin_mapping_old_to_new_10_25.csv (the
 *      same CSV AddressMappingService uses). Only an unambiguous exact
 *      match is accepted; anything else is left blank and reported under
 *      NEEDS REVIEW so it can be filled in by hand.
 *   5. name / phone — a phone number embedded in the name in parentheses,
 *      e.g. "Sân cầu TA 512 Ngọc Hồi (0915533994)", is extracted into a new
 *      `phone` column and stripped from the name.
 *
 * This script only rewrites CSV text — it never touches the database.
 *
 * Usage
 * -----
 *   npx ts-node -r tsconfig-paths/register scripts/normalize-hanoi-venues-csv.ts \
 *     --file=danh_sach_san_cau_long_ha_noi.csv
 *
 *   # write to a different file instead of overwriting the input
 *   npx ts-node -r tsconfig-paths/register scripts/normalize-hanoi-venues-csv.ts \
 *     --file=danh_sach_san_cau_long_ha_noi.csv --out=venues-clean.csv
 */
import * as fs from 'fs';
import * as path from 'path';

const CITY = 'Hà Nội';
const MAPPING_CSV = 'admin_mapping_old_to_new_10_25.csv';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string) =>
    args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const file = get('file') ?? 'danh_sach_san_cau_long_ha_noi.csv';
  return { file, out: get('out') ?? file };
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

function toCsvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function stripAdminPrefix(value: string): string {
  return value
    .trim()
    .replace(
      /^(?:thành\s*phố|tp|tỉnh|quận|q|huyện|h|thị\s*xã|tx|thị\s*trấn|tt|phường|p|xã|x)\.?\s+/i,
      ''
    )
    .trim()
    .toLowerCase()
    .replace(/\s*-\s*/g, '-'); // unify hyphen spacing, e.g. "Văn Miếu - Quốc Tử Giám" vs "Văn Miếu-Quốc Tử Giám"
}

/**
 * Load the canonical set of old-era Hanoi district names from the shared
 * admin-mapping CSV, a ward -> district lookup for the fallback pass (many
 * venue addresses only mention the ward, e.g. "Xuân Phương", not the
 * district), and the set of NEW-era (post Nghị quyết 60) Hanoi ward names.
 *
 * Some scraped addresses already use the new ward name directly (e.g.
 * "Từ Liêm" is genuinely ambiguous as an OLD district — it was split into
 * Nam/Bắc Từ Liêm in 2013 — but "Phường Từ Liêm" is a real, unambiguous NEW
 * ward post-merger). Those rows can't resolve an old `district`, but can
 * still get `newDistrict` filled directly.
 *
 * Ward names that map to more than one Hanoi district (14 such collisions
 * exist at the old-ward level, e.g. "Phường Minh Khai") are marked
 * ambiguous and excluded from the fallback so we never guess wrong. New
 * ward names are the final unique administrative units, so no such
 * disambiguation is needed for them.
 */
function loadHanoiDistricts(): {
  districts: Map<string, string>;
  wardToDistrict: Map<string, string>;
  newWards: Map<string, string>;
} {
  const csvPath = path.resolve(__dirname, '..', MAPPING_CSV);
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());
  const districts = new Map<string, string>(); // normalized -> canonical ("Quận Ba Đình")
  const wardDistricts = new Map<string, Set<string>>(); // normalized old ward -> set of canonical districts
  const newWards = new Map<string, string>(); // normalized new ward -> canonical ("Phường Từ Liêm")

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 10) continue;
    const cityNameOld = cols[1]?.trim();
    const districtNameOld = cols[3]?.trim();
    const wardNameOld = cols[5]?.trim();
    const cityNameNew = cols[7]?.trim();
    const wardNameNew = cols[9]?.trim();

    if (cityNameOld?.includes('Hà Nội') && districtNameOld) {
      districts.set(stripAdminPrefix(districtNameOld), districtNameOld);

      if (wardNameOld) {
        const wardKey = stripAdminPrefix(wardNameOld);
        if (!wardDistricts.has(wardKey)) wardDistricts.set(wardKey, new Set());
        wardDistricts.get(wardKey)!.add(districtNameOld);
      }
    }

    if (cityNameNew?.includes('Hà Nội') && wardNameNew) {
      newWards.set(stripAdminPrefix(wardNameNew), wardNameNew);
    }
  }

  const wardToDistrict = new Map<string, string>();
  for (const [ward, districtSet] of wardDistricts) {
    if (districtSet.size === 1) {
      wardToDistrict.set(ward, [...districtSet][0]);
    }
  }
  return { districts, wardToDistrict, newWards };
}

/** Strip scrape artifacts: the "incomplete address" tag and any truncated "...)" parenthetical. */
function cleanAddress(address: string): string {
  return address
    .replace(/\([^()]*\.\.\.\)/g, '')
    .replace(/\(địa chỉ hiển thị không đầy đủ\)/g, '')
    .replace(/\s*,\s*,/g, ',')
    .replace(/,\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** For addresses with zero commas, convert " - " separators to ", " so segment-based parsing works. */
function normalizeSeparators(address: string): string {
  if (address.includes(',')) return address;
  if (!address.includes(' - ')) return address;
  return address
    .split(' - ')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

function inferDistrict(
  address: string,
  districts: Map<string, string>,
  wardToDistrict: Map<string, string>
): string | null {
  const segments = address
    .split(',')
    .map((s) => stripAdminPrefix(s))
    .filter(Boolean)
    .reverse(); // district usually sits near the end, just before the city

  // Pass 1: a segment names the district directly.
  for (const seg of segments) {
    if (seg === 'hà nội' || seg === 'hn' || seg === 'việt nam') continue;
    const match = districts.get(seg);
    if (match) return match;
  }

  // Pass 2: fall back to ward -> district, only when the ward name maps to
  // exactly one Hanoi district (ambiguous wards were excluded upstream).
  for (const seg of segments) {
    if (seg === 'hà nội' || seg === 'hn' || seg === 'việt nam') continue;
    const match = wardToDistrict.get(seg);
    if (match) return match;
  }
  return null;
}

/**
 * For rows where no OLD district could be inferred: check whether a segment
 * is actually a valid NEW (post-reform) ward name instead — e.g. "Từ Liêm"
 * doesn't resolve as an old district (ambiguous: Nam/Bắc Từ Liêm), but
 * "Phường Từ Liêm" is a real, unambiguous new ward. When found, this can be
 * written straight to `newDistrict` — VenuesService.create() treats an
 * explicit `newDistrict` as authoritative and skips the old->new resolve
 * step entirely, so no old `district`/`city` is needed for that row.
 */
function inferNewDistrict(
  address: string,
  newWards: Map<string, string>
): string | null {
  const segments = address
    .split(',')
    .map((s) => stripAdminPrefix(s))
    .filter(Boolean)
    .reverse();

  for (const seg of segments) {
    if (seg === 'hà nội' || seg === 'hn' || seg === 'việt nam') continue;
    const match = newWards.get(seg);
    if (match) return match;
  }
  return null;
}

const PHONE_IN_NAME = /\s*\((0\d{8,10})\)/;

function extractPhone(name: string): { name: string; phone: string | null } {
  const match = name.match(PHONE_IN_NAME);
  if (!match) return { name, phone: null };
  return { name: name.replace(PHONE_IN_NAME, '').trim(), phone: match[1] };
}

/**
 * VenuesService.generateUniqueSlug() always prepends the sport-type label
 * ("Sân cầu lông") to `name` before slugifying — see SPORT_PREFIX in
 * venues.service.ts. If the CSV `name` already leads with that same phrase,
 * the generated slug/searchTerms end up with it duplicated (observed
 * earlier: "san-cau-long-san-cau-long-test-a"). Existing DB venues follow
 * the convention of NOT including the sport prefix in `name` (e.g. "Kỳ
 * Hòa", "Tường Anh" — not "Sân cầu lông Kỳ Hòa").
 *
 * Only strips a LEADING occurrence (optionally followed by a connector like
 * "-", ":", "&", "và") — mid-name mentions (e.g. "... & Cầu Lông - 38 Đại
 * Từ", "Ngọc Vân Badminton (Sân cầu lông Ngọc Vân)") are left untouched
 * since blindly stripping there risks breaking grammar/meaning.
 */
const SPORT_NAME_PREFIX =
  /^(?:sân\s*cầu\s*lông|sân\s*cầu|cầu\s*lông)\b\s*(?:[-:&]|và)?\s*/i;

function stripSportPrefix(name: string): string {
  const stripped = name.replace(SPORT_NAME_PREFIX, '').trim();
  return stripped.length > 0 ? stripped : name;
}

async function main() {
  const { file, out } = parseArgs();
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  const { districts, wardToDistrict, newWards } = loadHanoiDistricts();
  console.log(
    `Loaded ${districts.size} known Hanoi districts/huyện, ${wardToDistrict.size} unambiguous ward->district mappings, ${newWards.size} new-era ward names.`
  );

  const rows = parseCsv(fs.readFileSync(file, 'utf-8'));
  const [header, ...dataRows] = rows;
  const columns = header.map((h) => h.trim());

  const idx = (name: string) => columns.indexOf(name);
  const nameIdx = idx('name');
  const addressIdx = idx('address');
  if (nameIdx === -1 || addressIdx === -1) {
    console.error('CSV must have "name" and "address" columns.');
    process.exitCode = 1;
    return;
  }

  const outColumns = [...columns];
  if (!outColumns.includes('district')) outColumns.push('district');
  if (!outColumns.includes('newDistrict')) outColumns.push('newDistrict');
  if (!outColumns.includes('city')) outColumns.push('city');
  if (!outColumns.includes('phone')) outColumns.push('phone');

  let addressCleaned = 0;
  let separatorsFixed = 0;
  let districtMatched = 0;
  let newDistrictMatched = 0;
  let phoneExtracted = 0;
  let namePrefixStripped = 0;
  const needsReview: { row: number; name: string; address: string }[] = [];

  const outRows: string[][] = [header.length ? outColumns : []];

  dataRows.forEach((cells, i) => {
    const record: Record<string, string> = {};
    columns.forEach((col, ci) => {
      record[col] = cells[ci] ?? '';
    });

    const { name: dephonedName, phone } = extractPhone(record.name);
    if (phone) phoneExtracted++;
    const cleanedName = stripSportPrefix(dephonedName);
    if (cleanedName !== dephonedName) namePrefixStripped++;
    record.name = cleanedName;
    if (phone) record.phone = phone;

    const original = record.address;
    let address = cleanAddress(original);
    if (address !== original) addressCleaned++;

    const beforeSeparatorFix = address;
    address = normalizeSeparators(address);
    if (address !== beforeSeparatorFix) separatorsFixed++;

    record.address = address;
    record.city = CITY;

    const district = inferDistrict(address, districts, wardToDistrict);
    if (district) {
      record.district = district;
      districtMatched++;
    } else if (!record.newDistrict) {
      // Old district couldn't be resolved — check if the address already
      // uses a valid NEW (post-reform) ward name instead (e.g. "Từ Liêm" is
      // ambiguous as an old district, but "Phường Từ Liêm" is a real new
      // ward). If so, `newDistrict` alone is enough for VenuesService to
      // build a correct `newAddress` without ever needing the old district.
      const newDistrict = inferNewDistrict(address, newWards);
      if (newDistrict) {
        record.newDistrict = newDistrict;
        newDistrictMatched++;
      } else {
        needsReview.push({ row: i + 2, name: cleanedName, address });
      }
    }

    outRows.push(outColumns.map((col) => record[col] ?? ''));
  });

  const csvOut = outRows
    .map((r) => r.map(toCsvCell).join(','))
    .join('\n');
  fs.writeFileSync(out, csvOut + '\n', 'utf-8');

  console.log('---');
  console.log(`Rows processed:          ${dataRows.length}`);
  console.log(`Address artifacts cleaned: ${addressCleaned}`);
  console.log(`Dash separators fixed:    ${separatorsFixed}`);
  console.log(`Phone extracted from name: ${phoneExtracted}`);
  console.log(`Sport-prefix stripped from name: ${namePrefixStripped}`);
  console.log(
    `District (old) auto-matched:    ${districtMatched} / ${dataRows.length}`
  );
  console.log(
    `newDistrict (new ward) matched: ${newDistrictMatched} / ${dataRows.length}`
  );
  console.log(`Needs manual review:     ${needsReview.length}`);
  console.log(`Written to:              ${out}`);

  if (needsReview.length > 0) {
    console.log(
      '\nRows with no district/newDistrict match — fill in `district` or `newDistrict` by hand before importing:'
    );
    for (const r of needsReview) {
      console.log(`  - row ${r.row} [${r.name}]: ${r.address}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
