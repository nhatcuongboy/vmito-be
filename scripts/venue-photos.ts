/**
 * venue-photos — one CLI for venue cover photos and Google Place IDs.
 *
 * Replaces the old pipeline (fetch_and_download_photos.py, find_place_ids.py,
 * upload_to_cloudinary.py, backfill-venue-cover-photos.ts,
 * update-venue-place-ids.ts). Venues are read straight from the DB; the only
 * file you edit by hand is the review CSV written by `find-place-ids`.
 *
 * Flows
 * -----
 *   stats            Count venues / missing covers / suspicious placeIds (DB read only)
 *   check-place-ids  Ask Google whether each venue's placeId still exists
 *   find-place-ids   Find the right placeId for broken ones -> review CSV to edit
 *   apply-place-ids  Write the reviewed placeIds to the DB
 *   fill-covers      Google photo -> Cloudinary -> Venue.coverPhoto (missing only)
 *   import-mapping   Write Cloudinary URLs from old mapping CSVs to the DB
 *   fix-all          find -> (you review) -> apply -> fill-covers, step by step
 *
 * Usage
 * -----
 *   pnpm venue-photos                          # interactive menu
 *   pnpm venue-photos stats --city="Hồ Chí Minh"
 *   pnpm venue-photos fill-covers --city="Hồ Chí Minh" --limit=5            # dry run
 *   pnpm venue-photos fill-covers --city="Hồ Chí Minh" --limit=5 --apply --yes
 *   pnpm venue-photos import-mapping --file=../cloudinary_mapping.csv,../b.csv --apply
 *
 * Options
 * -------
 *   --city=<name>       City filter on Venue.city / Venue.newCity ("all" = no filter)
 *   --limit=<n>         Process at most n venues
 *   --apply             Write changes (default: dry run, nothing written or uploaded)
 *   --yes               Skip the "type yes" confirmation (needed when not interactive)
 *   --overwrite         fill-covers / import-mapping: replace existing cover photos
 *   --landscape-only    fill-covers: skip venues that have no landscape photo
 *   --missing-cover     find-place-ids: only venues without a cover photo
 *   --all-status        Include INACTIVE venues (default: ACTIVE only)
 *   --fresh             find-place-ids: start a new review file instead of resuming
 *   --file=<a,b>        apply-place-ids: review CSV; import-mapping: mapping CSV(s)
 *   --out-dir=<dir>     Where reports go (default: ../../venue-photos, outside the repo)
 *
 * Environment
 * -----------
 *   DATABASE_URL         Target DB (printed, password masked, before any write)
 *   GOOGLE_MAPS_API_KEY  Places API (New); sent only as a header, never logged
 *   CLOUDINARY_URL       cloudinary://<key>:<secret>@<cloud_name>
 *
 * Notes: Google Maps ToS limits caching Places photos; re-run fill-covers
 * periodically if that matters for your use. Only placeId / coverPhoto /
 * coverPhotoPublicId are ever written — no schema or API change.
 */
import { Prisma, PrismaClient, VenueStatus } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline/promises';

// ============================================================================
// Config
// ============================================================================

const PLACES_BASE = 'https://places.googleapis.com/v1';
const MAX_PHOTO_PX = 1600;
const SLEEP_MS = 150;
const MAX_RETRIES = 3;
const LIKELY_THRESHOLD = 0.7;
const CLOUDINARY_FOLDER = 'courts';
const CLOUDINARY_URL_PATTERN = /^https:\/\/res\.cloudinary\.com\//;
const PUBLIC_ID_PATTERN = /\/upload\/(?:v\d+\/)?(?<publicId>.+)\.[^./]+$/;

interface Bounds {
  low: { latitude: number; longitude: number };
  high: { latitude: number; longitude: number };
}

/** Known cities: DB spellings to match + a box that keeps Text Search local. */
const CITY_PRESETS: Record<string, { aliases: string[]; bounds: Bounds }> = {
  ho_chi_minh: {
    aliases: ['Hồ Chí Minh', 'Ho Chi Minh', 'HCM', 'Sài Gòn', 'Saigon'],
    bounds: {
      low: { latitude: 10.35, longitude: 106.35 },
      high: { latitude: 11.25, longitude: 107.1 },
    },
  },
  ha_noi: {
    aliases: ['Hà Nội', 'Ha Noi', 'Hanoi'],
    bounds: {
      low: { latitude: 20.55, longitude: 105.25 },
      high: { latitude: 21.4, longitude: 106.05 },
    },
  },
};

const FLOWS = [
  ['stats', 'Thống kê sân / ảnh bìa / placeId (chỉ đọc)'],
  ['check-place-ids', 'Kiểm tra placeId còn tồn tại trên Google'],
  ['find-place-ids', 'Tìm placeId đúng cho sân bị sai -> file review'],
  ['apply-place-ids', 'Ghi placeId đã duyệt vào DB'],
  ['fill-covers', 'Bổ sung ảnh bìa còn thiếu (Google -> Cloudinary -> DB)'],
  ['import-mapping', 'Ghi link Cloudinary từ file mapping CSV cũ vào DB'],
  ['fix-all', 'Chạy trọn bộ: tìm -> duyệt -> ghi placeId -> ảnh bìa'],
] as const;
type Flow = (typeof FLOWS)[number][0];

interface Options {
  city: string;
  limit: number;
  apply: boolean;
  yes: boolean;
  overwrite: boolean;
  landscapeOnly: boolean;
  missingCover: boolean;
  allStatus: boolean;
  fresh: boolean;
  files: string[];
  outDir: string;
}

const prisma = new PrismaClient();
let rl: readline.Interface | null = null;
const interactive = process.stdin.isTTY && process.stdout.isTTY;

// ============================================================================
// Small utilities
// ============================================================================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stripAccents(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function slugify(s: string): string {
  return stripAccents(s).trim().toLowerCase().split(/\s+/).join('_');
}

// Generic words dropped before comparing venue names.
const NOISE = new Set(
  'san cau long badminton club clb pickleball pick sport sports the thao nha thi dau'.split(
    ' '
  )
);

function normalizeName(s: string): string {
  return stripAccents(s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !NOISE.has(t))
    .join(' ');
}

/** Levenshtein-based ratio, or token overlap — whichever is higher (0..1). */
function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  const dp = Array.from({ length: nb.length + 1 }, (_, j) => j);
  for (let i = 1; i <= na.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= nb.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (na[i - 1] === nb[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  const ratio = 1 - dp[nb.length] / Math.max(na.length, nb.length);
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  const common = [...ta].filter((t) => tb.has(t)).length;
  const overlap = common / Math.max(1, Math.min(ta.size, tb.size));
  return Math.round(Math.max(ratio, overlap * 0.9) * 100) / 100;
}

/** `place_xxx` slugs and ids with odd characters are certainly not Google ids. */
function isMalformedPlaceId(id: string): boolean {
  return id.startsWith('place_') || !/^[A-Za-z0-9_-]{10,}$/.test(id);
}

function extractPublicId(url: string): string | null {
  return PUBLIC_ID_PATTERN.exec(url)?.groups?.publicId ?? null;
}

function maskedDbTarget(): string {
  const url = process.env.DATABASE_URL ?? '';
  const m = /@([^/?]+)\/([^?]*)/.exec(url);
  return m ? `${m[1]}/${m[2]}` : '(DATABASE_URL not set)';
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

/** CSV file -> array of objects keyed by trimmed header names. */
function readCsv(file: string): Record<string, string>[] {
  const content = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const [header, ...rows] = parseCsv(content);
  if (!header) return [];
  const cols = header.map((h) => h.trim());
  return rows.map((cells) =>
    Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? '').trim()]))
  );
}

function csvCell(v: unknown): string {
  const s =
    v === null || v === undefined
      ? ''
      : typeof v === 'object'
        ? JSON.stringify(v)
        : String(v as string | number | boolean);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Writes with a BOM so Excel opens Vietnamese text correctly. */
function writeCsv(
  file: string,
  columns: string[],
  rows: Record<string, unknown>[]
) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [columns.join(',')].concat(
    rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))
  );
  fs.writeFileSync(file, '\uFEFF' + lines.join('\n') + '\n', 'utf8');
}

function appendCsvRow(
  file: string,
  columns: string[],
  row: Record<string, unknown>
) {
  if (!fs.existsSync(file)) writeCsv(file, columns, []);
  fs.appendFileSync(
    file,
    columns.map((c) => csvCell(row[c])).join(',') + '\n',
    'utf8'
  );
}

function reportPath(opts: Options, name: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return path.join(opts.outDir, `${name}-${citySlug(opts)}-${stamp}.csv`);
}

function reviewPath(opts: Options): string {
  return path.join(opts.outDir, `review-${citySlug(opts)}.csv`);
}

function citySlug(opts: Options): string {
  return opts.city.toLowerCase() === 'all' ? 'all' : slugify(opts.city);
}

async function ask(question: string, fallback = ''): Promise<string> {
  if (!interactive) return fallback;
  rl ??= readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = (await rl.question(question)).trim();
  return answer || fallback;
}

/** Last gate before any write. Returns false when the run stays a dry run. */
async function confirmWrite(opts: Options, what: string): Promise<boolean> {
  if (!opts.apply) return false;
  console.log(`\n>>> Sắp GHI THẬT: ${what}`);
  console.log(`>>> Database: ${maskedDbTarget()}`);
  if (opts.yes) return true;
  if (!interactive) {
    throw new Error('Cần thêm --yes khi chạy --apply không tương tác.');
  }
  const answer = await ask('>>> Gõ "yes" để tiếp tục: ');
  if (answer !== 'yes') {
    console.log('Đã huỷ, không ghi gì.');
    return false;
  }
  return true;
}

// ============================================================================
// Google Places API (New)
// ============================================================================

interface GPhoto {
  name: string;
  widthPx?: number;
  heightPx?: number;
}
interface GPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  photos?: GPhoto[];
}
interface GoogleBody extends Partial<GPlace> {
  error?: { status?: string };
  places?: GPlace[];
  photoUri?: string;
}
interface GoogleResult {
  status: number;
  body: GoogleBody;
}

function requireGoogleKey(): string {
  const key = (process.env.GOOGLE_MAPS_API_KEY ?? '').trim();
  if (!key) throw new Error('Chưa set biến môi trường GOOGLE_MAPS_API_KEY.');
  if (/\s|["”“]/.test(key)) {
    throw new Error(
      'GOOGLE_MAPS_API_KEY chứa khoảng trắng hoặc dấu nháy — hãy đặt lại biến.'
    );
  }
  return key;
}

/** fetch with retry on 429/5xx/network errors. Never puts the key in a URL. */
async function google(
  url: string,
  init: { method?: string; fieldMask?: string; body?: unknown } = {}
): Promise<GoogleResult> {
  const headers: Record<string, string> = {
    'X-Goog-Api-Key': requireGoogleKey(),
  };
  if (init.fieldMask) headers['X-Goog-FieldMask'] = init.fieldMask;
  if (init.body) headers['Content-Type'] = 'application/json';

  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        method: init.method ?? 'GET',
        headers,
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      const body = (await res.json().catch(() => ({}))) as GoogleBody;
      return { status: res.status, body };
    } catch (err) {
      if (attempt >= MAX_RETRIES) {
        return { status: 0, body: { error: { status: (err as Error).name } } };
      }
      await sleep(1000 * 2 ** attempt);
    }
  }
}

/** Short, key-free description of a failed Google response. */
function googleError(r: GoogleResult): string {
  return `HTTP ${r.status}${r.body?.error?.status ? ` ${r.body.error.status}` : ''}`;
}

type PlaceCheck =
  | { kind: 'VALID'; place: GPlace }
  | { kind: 'INVALID' | 'NOT_FOUND' | 'ERROR'; detail: string };

async function getPlace(
  placeId: string,
  fieldMask: string
): Promise<PlaceCheck> {
  if (isMalformedPlaceId(placeId)) {
    return { kind: 'INVALID', detail: 'malformed id (no API call)' };
  }
  const r = await google(
    `${PLACES_BASE}/places/${encodeURIComponent(placeId)}`,
    {
      fieldMask,
    }
  );
  if (r.status === 200) return { kind: 'VALID', place: r.body as GPlace };
  if (r.status === 400) return { kind: 'INVALID', detail: googleError(r) };
  if (r.status === 404) return { kind: 'NOT_FOUND', detail: googleError(r) };
  return { kind: 'ERROR', detail: googleError(r) };
}

async function searchPlace(
  query: string,
  bounds: Bounds | undefined
): Promise<{ place: GPlace | null; error?: string }> {
  const r = await google(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    fieldMask: 'places.id,places.displayName,places.formattedAddress',
    body: {
      textQuery: query,
      languageCode: 'vi',
      regionCode: 'VN',
      pageSize: 1,
      ...(bounds ? { locationRestriction: { rectangle: bounds } } : {}),
    },
  });
  if (r.status !== 200) return { place: null, error: googleError(r) };
  return { place: r.body.places?.[0] ?? null };
}

/** Prefer the widest landscape photo; fall back to the first one. */
function choosePhoto(
  photos: { name: string; widthPx?: number; heightPx?: number }[],
  landscapeOnly: boolean
) {
  const landscape = photos.filter((p) => (p.widthPx ?? 0) > (p.heightPx ?? 0));
  if (landscape.length > 0) {
    const best = landscape.reduce((a, b) =>
      (b.widthPx ?? 0) > (a.widthPx ?? 0) ? b : a
    );
    return { photo: best, orientation: 'landscape' };
  }
  if (landscapeOnly || photos.length === 0) return null;
  const p = photos[0];
  const w = p.widthPx ?? 0;
  const h = p.heightPx ?? 0;
  return { photo: p, orientation: h > w ? 'portrait' : 'square' };
}

async function downloadPlacePhoto(
  photoName: string
): Promise<{ data: Buffer; contentType: string }> {
  const meta = await google(
    `${PLACES_BASE}/${photoName}/media?maxWidthPx=${MAX_PHOTO_PX}&maxHeightPx=${MAX_PHOTO_PX}&skipHttpRedirect=true`
  );
  const uri = meta.body?.photoUri;
  if (meta.status !== 200 || !uri)
    throw new Error(`photo ${googleError(meta)}`);
  const res = await fetch(uri);
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.startsWith('image/')) {
    throw new Error(`photo download HTTP ${res.status} (${contentType})`);
  }
  return { data: Buffer.from(await res.arrayBuffer()), contentType };
}

// ============================================================================
// Cloudinary + DB helpers
// ============================================================================

function requireCloudinary() {
  const url = (process.env.CLOUDINARY_URL ?? '').trim();
  if (!url.startsWith('cloudinary://') || /\s|["”“]/.test(url)) {
    throw new Error('CLOUDINARY_URL chưa set hoặc sai dạng cloudinary://...');
  }
  cloudinary.config(true); // reads CLOUDINARY_URL from the environment
}

async function uploadToCloudinary(
  image: { data: Buffer; contentType: string },
  publicId: string
) {
  const dataUri = `data:${image.contentType};base64,${image.data.toString('base64')}`;
  const res = await cloudinary.uploader.upload(dataUri, {
    public_id: publicId,
    overwrite: true,
    unique_filename: false,
    resource_type: 'image',
  });
  return { url: res.secure_url, publicId: res.public_id };
}

function cityWhere(opts: Options): Prisma.VenueWhereInput {
  const and: Prisma.VenueWhereInput[] = [];
  if (!opts.allStatus) and.push({ status: VenueStatus.ACTIVE });
  if (opts.city.toLowerCase() !== 'all') {
    const preset = CITY_PRESETS[slugify(opts.city)];
    const names = preset ? preset.aliases : [opts.city];
    and.push({
      OR: names.flatMap((n) => [
        { city: { contains: n, mode: 'insensitive' as const } },
        { newCity: { contains: n, mode: 'insensitive' as const } },
      ]),
    });
  }
  return { AND: and };
}

const missingCover: Prisma.VenueWhereInput = {
  OR: [{ coverPhoto: null }, { coverPhoto: '' }],
};

const venueSelect = {
  id: true,
  slug: true,
  name: true,
  address: true,
  district: true,
  newDistrict: true,
  city: true,
  newCity: true,
  placeId: true,
  coverPhoto: true,
} satisfies Prisma.VenueSelect;
type VenueRow = Prisma.VenueGetPayload<{ select: typeof venueSelect }>;

const label = (v: { slug: string | null; id: string; name: string }) =>
  `${v.name} (${v.slug ?? v.id})`;

/** Writes the cover only if the venue still has none (unless --overwrite). */
async function writeCover(
  venueId: string,
  url: string,
  publicId: string | null,
  overwrite: boolean
): Promise<boolean> {
  const res = await prisma.venue.updateMany({
    where: overwrite ? { id: venueId } : { id: venueId, ...missingCover },
    data: { coverPhoto: url, coverPhotoPublicId: publicId },
  });
  return res.count > 0;
}

function summary(
  title: string,
  counts: Record<string, number>,
  report?: string
) {
  console.log(`\n---------------- ${title} ----------------`);
  for (const [k, v] of Object.entries(counts)) {
    console.log(`${k.padEnd(22)} ${v}`);
  }
  if (report) console.log(`Báo cáo: ${report}`);
}

// ============================================================================
// Flows
// ============================================================================

async function flowStats(opts: Options) {
  const venues = await prisma.venue.findMany({
    where: cityWhere(opts),
    select: { city: true, newCity: true, placeId: true, coverPhoto: true },
  });
  const groups = new Map<string, number[]>();
  for (const v of venues) {
    const key = v.newCity || v.city || '(không rõ)';
    const g = groups.get(key) ?? [0, 0, 0, 0];
    g[0]++;
    if (!v.coverPhoto) g[1]++;
    if (!v.placeId) g[2]++;
    else if (isMalformedPlaceId(v.placeId) || v.placeId.length !== 27) g[3]++;
    groups.set(key, g);
  }
  console.log(
    `\n${'Thành phố'.padEnd(26)}${'Tổng'.padStart(7)}${'Thiếu ảnh'.padStart(11)}${'Không placeId'.padStart(15)}${'placeId lạ'.padStart(12)}`
  );
  const rows = [...groups.entries()].sort((a, b) => b[1][0] - a[1][0]);
  for (const [city, [total, noCover, noPlace, odd]] of rows.slice(0, 25)) {
    console.log(
      `${city.slice(0, 25).padEnd(26)}${String(total).padStart(7)}${String(noCover).padStart(11)}${String(noPlace).padStart(15)}${String(odd).padStart(12)}`
    );
  }
  console.log(
    '\n"placeId lạ" = dạng place_xxx hoặc độ dài khác 27 ký tự: rất có thể sai, chạy check-place-ids để chắc chắn.'
  );
}

async function flowCheckPlaceIds(opts: Options) {
  const venues = await prisma.venue.findMany({
    where: { ...cityWhere(opts), placeId: { not: null } },
    select: venueSelect,
    orderBy: { name: 'asc' },
    ...(opts.limit ? { take: opts.limit } : {}),
  });
  console.log(`Kiểm tra ${venues.length} sân...`);
  const counts: Record<string, number> = {};
  const rows: Record<string, unknown>[] = [];
  for (const [i, v] of venues.entries()) {
    const placeId = v.placeId as string;
    const res = await getPlace(placeId, 'id');
    let status: string = res.kind;
    let note = res.kind === 'VALID' ? '' : res.detail;
    if (res.kind === 'VALID' && res.place.id !== placeId) {
      status = 'VALID_NEW_ID';
      note = `Google trả về id mới: ${res.place.id}`;
    }
    counts[status] = (counts[status] ?? 0) + 1;
    rows.push({ id: v.id, slug: v.slug, name: v.name, placeId, status, note });
    console.log(`[${i + 1}/${venues.length}] ${status.padEnd(12)} ${label(v)}`);
    if (!isMalformedPlaceId(placeId)) await sleep(SLEEP_MS);
  }
  const file = reportPath(opts, 'check');
  writeCsv(file, ['id', 'slug', 'name', 'placeId', 'status', 'note'], rows);
  summary('Kiểm tra placeId', counts, file);
}

const REVIEW_COLUMNS = [
  'id',
  'slug',
  'name',
  'address',
  'old_placeId',
  'new_placeId',
  'google_name',
  'google_address',
  'similarity',
  'status',
  'accept',
  'note',
];

async function flowFindPlaceIds(opts: Options) {
  const file = reviewPath(opts);
  if (opts.fresh && fs.existsSync(file)) fs.unlinkSync(file);
  const done = new Set(
    fs.existsSync(file) ? readCsv(file).map((r) => r.id) : []
  );
  if (done.size)
    console.log(`Tiếp tục file review cũ (${done.size} sân đã tìm).`);

  const venues = (
    await prisma.venue.findMany({
      where: {
        ...cityWhere(opts),
        ...(opts.missingCover ? missingCover : {}),
      },
      select: venueSelect,
      orderBy: { name: 'asc' },
    })
  ).filter((v) => !done.has(v.id));
  const bounds = CITY_PRESETS[slugify(opts.city)]?.bounds;
  if (!bounds && opts.city.toLowerCase() !== 'all') {
    console.log(
      `(Không có khung toạ độ cho "${opts.city}", tìm không giới hạn khu vực.)`
    );
  }

  const counts: Record<string, number> = {};
  let processed = 0;
  for (const v of venues) {
    if (opts.limit && processed >= opts.limit) break;
    const row: Record<string, unknown> = {
      id: v.id,
      slug: v.slug,
      name: v.name,
      address: v.address,
      old_placeId: v.placeId ?? '',
      accept: '',
    };

    // Valid ids are left alone (cheap id-only lookup); refreshed ids are proposed.
    if (v.placeId) {
      const check = await getPlace(v.placeId, 'id');
      if (check.kind === 'VALID' && check.place.id === v.placeId) continue;
      if (check.kind === 'ERROR') {
        console.log(`  ! ${label(v)}: ${check.detail}, bỏ qua lần này`);
        continue;
      }
      if (check.kind === 'VALID') {
        Object.assign(row, {
          new_placeId: check.place.id,
          similarity: 1,
          status: 'LIKELY',
          note: 'Google đã đổi id của địa điểm này',
        });
      }
    }

    if (!row.status) {
      const district = v.newDistrict || v.district || '';
      const query = [v.name, v.address, district].filter(Boolean).join(', ');
      const { place, error } = await searchPlace(query, bounds);
      if (error) {
        console.log(`  ! ${label(v)}: ${error}, bỏ qua lần này`);
        continue;
      } else if (!place) {
        row.status = 'NOT_FOUND';
      } else {
        const sim = similarity(v.name, place.displayName?.text ?? '');
        Object.assign(row, {
          new_placeId: place.id,
          google_name: place.displayName?.text ?? '',
          google_address: place.formattedAddress ?? '',
          similarity: sim,
          status: sim >= LIKELY_THRESHOLD ? 'LIKELY' : 'REVIEW',
        });
        const owner = await prisma.venue.findUnique({
          where: { placeId: place.id },
          select: { id: true, name: true },
        });
        if (owner && owner.id !== v.id) {
          row.status = 'REVIEW';
          row.note = `placeId này đang thuộc sân "${owner.name}" (${owner.id}) — có thể trùng sân`;
        }
      }
    }

    processed++;
    counts[row.status as string] = (counts[row.status as string] ?? 0) + 1;
    appendCsvRow(file, REVIEW_COLUMNS, row);
    console.log(
      `[${processed}] ${String(row.status).padEnd(9)} ${v.name} -> ${(row.google_name as string) || (row.new_placeId as string) || '—'}`
    );
    await sleep(SLEEP_MS);
  }
  summary('Tìm placeId', { 'Sân đã xử lý': processed, ...counts }, file);
  console.log(
    'Mở file review: dòng LIKELY sẽ được áp dụng (ghi "n" vào cột accept để loại),\n' +
      'dòng REVIEW chỉ áp dụng khi bạn ghi "y". Xem kỹ google_address trước khi duyệt.'
  );
  return file;
}

async function flowApplyPlaceIds(opts: Options) {
  const file = opts.files[0] ?? reviewPath(opts);
  if (!fs.existsSync(file)) throw new Error(`Không thấy file review: ${file}`);
  const accepted = readCsv(file).filter((r) => {
    const a = (r.accept ?? '').toLowerCase();
    return r.new_placeId && (a === 'y' || (r.status === 'LIKELY' && a !== 'n'));
  });
  console.log(`${file}: ${accepted.length} dòng được chấp nhận.`);

  const seen = new Map<string, number>();
  for (const r of accepted)
    seen.set(r.new_placeId, (seen.get(r.new_placeId) ?? 0) + 1);

  const plan: { venue: VenueRow; newPlaceId: string }[] = [];
  const skipped: string[] = [];
  let unchanged = 0;
  for (const r of accepted) {
    if ((seen.get(r.new_placeId) ?? 0) > 1) {
      skipped.push(`${r.name}: placeId ${r.new_placeId} lặp ở nhiều dòng`);
      continue;
    }
    const venue = await prisma.venue.findUnique({
      where: { id: r.id },
      select: venueSelect,
    });
    if (!venue) {
      skipped.push(`${r.name} (${r.id}): không có trong DB này`);
      continue;
    }
    if (venue.placeId === r.new_placeId) {
      unchanged++;
      continue;
    }
    if ((venue.placeId ?? '') !== r.old_placeId) {
      skipped.push(`${label(venue)}: placeId trong DB đã đổi kể từ lúc tìm`);
      continue;
    }
    const owner = await prisma.venue.findUnique({
      where: { placeId: r.new_placeId },
      select: { id: true, name: true },
    });
    if (owner) {
      skipped.push(
        `${label(venue)}: placeId mới đang thuộc "${owner.name}" (${owner.id})`
      );
      continue;
    }
    plan.push({ venue, newPlaceId: r.new_placeId });
  }

  for (const p of plan) {
    console.log(
      `  ${label(p.venue)}: ${p.venue.placeId ?? 'null'} -> ${p.newPlaceId}`
    );
  }
  const write = await confirmWrite(opts, `đổi placeId cho ${plan.length} sân`);
  if (write) {
    for (const p of plan) {
      await prisma.venue.update({
        where: { id: p.venue.id },
        data: { placeId: p.newPlaceId },
      });
    }
  }
  skipped.forEach((s) => console.log(`  bỏ qua: ${s}`));
  summary('Ghi placeId', {
    [write ? 'Đã cập nhật' : 'Sẽ cập nhật (dry run)']: plan.length,
    'Đã đúng sẵn': unchanged,
    'Bỏ qua': skipped.length,
  });
}

async function flowFillCovers(opts: Options) {
  const venues = (
    await prisma.venue.findMany({
      where: {
        ...cityWhere(opts),
        ...(opts.overwrite ? {} : missingCover),
        placeId: { not: null },
      },
      select: venueSelect,
      orderBy: { name: 'asc' },
    })
  )
    .filter((v) => !isMalformedPlaceId(v.placeId as string))
    .slice(0, opts.limit || undefined);

  console.log(`${venues.length} sân thiếu ảnh bìa có placeId dùng được.`);
  if (
    !(await confirmWrite(
      opts,
      `lấy ảnh Google + upload Cloudinary + ghi DB cho ${venues.length} sân`
    ))
  ) {
    venues.forEach((v) => console.log(`  - ${label(v)}`));
    console.log(
      '\nDry run: chưa gọi Google/Cloudinary. Thêm --apply để chạy thật (có tính phí Google).'
    );
    return;
  }
  requireGoogleKey();
  requireCloudinary();

  const counts: Record<string, number> = {};
  const rows: Record<string, unknown>[] = [];
  for (const [i, v] of venues.entries()) {
    const placeId = v.placeId as string;
    let status = 'OK';
    let note = '';
    let url = '';
    try {
      const res = await getPlace(placeId, 'id,photos');
      if (res.kind !== 'VALID') {
        status = `PLACE_${res.kind}`;
        note = res.detail;
      } else {
        const chosen = choosePhoto(res.place.photos ?? [], opts.landscapeOnly);
        if (!chosen) {
          status = 'NO_PHOTO';
        } else {
          const image = await downloadPlacePhoto(chosen.photo.name);
          const city = slugify(v.newCity || v.city || opts.city);
          const up = await uploadToCloudinary(
            image,
            `${CLOUDINARY_FOLDER}/${city}/${placeId}`
          );
          url = up.url;
          note = chosen.orientation;
          const written = await writeCover(
            v.id,
            up.url,
            up.publicId,
            opts.overwrite
          );
          if (!written) status = 'ALREADY_HAS_COVER';
        }
      }
    } catch (err) {
      status = 'ERROR';
      note = (err as Error).message;
    }
    counts[status] = (counts[status] ?? 0) + 1;
    rows.push({
      id: v.id,
      slug: v.slug,
      name: v.name,
      placeId,
      status,
      coverPhoto: url,
      note,
    });
    console.log(
      `[${i + 1}/${venues.length}] ${status.padEnd(18)} ${label(v)}${note ? ` (${note})` : ''}`
    );
    await sleep(SLEEP_MS);
  }
  const file = reportPath(opts, 'covers');
  writeCsv(
    file,
    ['id', 'slug', 'name', 'placeId', 'status', 'coverPhoto', 'note'],
    rows
  );
  summary('Bổ sung ảnh bìa', counts, file);
  if (counts.PLACE_INVALID || counts.PLACE_NOT_FOUND) {
    console.log(
      'Có placeId sai -> chạy find-place-ids rồi apply-place-ids, sau đó chạy lại fill-covers.'
    );
  }
}

async function flowImportMapping(opts: Options) {
  if (opts.files.length === 0)
    throw new Error('Cần --file=<mapping.csv>[,<khac.csv>]');
  const entries = new Map<string, { url: string; publicId: string | null }>();
  for (const file of opts.files) {
    const rows = readCsv(file);
    let used = 0;
    for (const r of rows) {
      const url = r.coverPhoto || r.imageUrl || '';
      if (!r.placeId || !CLOUDINARY_URL_PATTERN.test(url)) continue;
      entries.set(r.placeId, {
        url,
        publicId: r.coverPhotoPublicId || extractPublicId(url),
      });
      used++;
    }
    console.log(`  ${file}: ${rows.length} dòng, dùng được ${used}`);
  }

  const venues = await prisma.venue.findMany({
    where: { ...cityWhere(opts), placeId: { in: [...entries.keys()] } },
    select: venueSelect,
  });
  const todo = venues.filter((v) => opts.overwrite || !v.coverPhoto);
  todo.forEach((v) =>
    console.log(`  ${label(v)} -> ${entries.get(v.placeId as string)?.url}`)
  );

  const write = await confirmWrite(opts, `ghi ảnh bìa cho ${todo.length} sân`);
  let written = 0;
  if (write) {
    for (const v of todo) {
      const e = entries.get(v.placeId as string);
      if (e && (await writeCover(v.id, e.url, e.publicId, opts.overwrite)))
        written++;
    }
  }
  summary('Nhập mapping', {
    'Link trong file': entries.size,
    'Khớp sân trong DB': venues.length,
    'Đã có ảnh (giữ nguyên)': venues.length - todo.length,
    [write ? 'Đã ghi' : 'Sẽ ghi (dry run)']: write ? written : todo.length,
    'placeId không có trong DB': entries.size - venues.length,
  });
}

async function flowFixAll(opts: Options) {
  if (!interactive)
    throw new Error('fix-all cần chạy trong terminal tương tác.');
  console.log('\n== Bước 1/4: thống kê');
  await flowStats(opts);

  console.log('\n== Bước 2/4: tìm placeId đúng cho sân bị sai');
  const onlyMissing =
    (await ask('Chỉ xử lý sân đang thiếu ảnh bìa? [Y/n] ', 'y')) !== 'n';
  const file = await flowFindPlaceIds({ ...opts, missingCover: onlyMissing });

  await ask(
    `\nMở và duyệt file:\n  ${file}\nLưu file rồi nhấn Enter để tiếp tục... `
  );

  console.log('\n== Bước 3/4: ghi placeId đã duyệt');
  await flowApplyPlaceIds({ ...opts, files: [file], apply: false });
  if ((await ask('Ghi các placeId trên vào DB? [y/N] ', 'n')) === 'y') {
    await flowApplyPlaceIds({ ...opts, files: [file], apply: true });
  }

  console.log('\n== Bước 4/4: bổ sung ảnh bìa');
  await flowFillCovers({ ...opts, apply: false });
  if (
    (await ask('Lấy ảnh + upload + ghi DB cho các sân trên? [y/N] ', 'n')) ===
    'y'
  ) {
    await flowFillCovers({ ...opts, apply: true });
  }
}

const RUNNERS: Record<Flow, (opts: Options) => Promise<unknown>> = {
  stats: flowStats,
  'check-place-ids': flowCheckPlaceIds,
  'find-place-ids': flowFindPlaceIds,
  'apply-place-ids': flowApplyPlaceIds,
  'fill-covers': flowFillCovers,
  'import-mapping': flowImportMapping,
  'fix-all': flowFixAll,
};
const WRITE_FLOWS = new Set<Flow>([
  'apply-place-ids',
  'fill-covers',
  'import-mapping',
]);

// ============================================================================
// CLI
// ============================================================================

function parseArgs(argv: string[]): { flow?: Flow; opts: Options } {
  const flag = (name: string) => argv.includes(`--${name}`);
  const value = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const positional = argv.find((a) => !a.startsWith('--'));
  if (positional && !(positional in RUNNERS)) {
    throw new Error(
      `Luồng không hợp lệ: ${positional}. Có: ${Object.keys(RUNNERS).join(', ')}`
    );
  }
  return {
    flow: positional as Flow | undefined,
    opts: {
      city: value('city') ?? 'Hồ Chí Minh',
      limit: Number(value('limit') ?? 0) || 0,
      apply: flag('apply'),
      yes: flag('yes'),
      overwrite: flag('overwrite'),
      landscapeOnly: flag('landscape-only'),
      missingCover: flag('missing-cover'),
      allStatus: flag('all-status'),
      fresh: flag('fresh'),
      files: (value('file') ?? '')
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean),
      outDir: path.resolve(
        value('out-dir') ?? path.join(__dirname, '../../venue-photos')
      ),
    },
  };
}

async function menu(base: Options) {
  for (;;) {
    console.log(`\n=== venue-photos  (DB: ${maskedDbTarget()}) ===`);
    FLOWS.forEach(([name, desc], i) =>
      console.log(`  ${i + 1}. ${name.padEnd(16)} ${desc}`)
    );
    console.log('  0. Thoát');
    const pick = Number(await ask('Chọn: ', '0'));
    if (!pick || !FLOWS[pick - 1]) return;
    const flow = FLOWS[pick - 1][0];

    const opts: Options = { ...base, files: [...base.files] };
    opts.city = await ask(
      `Thành phố (all = tất cả) [${base.city}]: `,
      base.city
    );
    if (flow !== 'stats' && flow !== 'import-mapping') {
      opts.limit =
        Number(await ask('Giới hạn số sân (Enter = không giới hạn): ', '0')) ||
        0;
    }
    if (flow === 'import-mapping') {
      const files = await ask('File mapping CSV (cách nhau bằng dấu phẩy): ');
      opts.files = files
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);
    }
    if (flow === 'apply-place-ids') {
      const f = await ask(
        `File review [${reviewPath(opts)}]: `,
        reviewPath(opts)
      );
      opts.files = [f];
    }
    if (WRITE_FLOWS.has(flow)) {
      opts.apply =
        (await ask('Chạy thử (Enter) hay ghi thật (g)? ', '')) === 'g';
    }
    try {
      await RUNNERS[flow](opts);
    } catch (err) {
      console.error(`Lỗi: ${(err as Error).message}`);
    }
  }
}

async function main() {
  const { flow, opts } = parseArgs(process.argv.slice(2));
  if (flow) {
    console.log(
      `Luồng: ${flow} | Thành phố: ${opts.city} | ${opts.apply ? 'GHI THẬT' : 'DRY RUN'} | DB: ${maskedDbTarget()}`
    );
    await RUNNERS[flow](opts);
  } else if (interactive) {
    await menu(opts);
  } else {
    console.log(`Cần chỉ định luồng: ${Object.keys(RUNNERS).join(', ')}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(`Lỗi: ${(err as Error).message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl?.close();
    await prisma.$disconnect();
  });
