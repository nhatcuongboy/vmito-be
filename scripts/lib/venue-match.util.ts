/**
 * Address / phone / brand normalisation helpers for matching a candidate
 * venue list (e.g. a pickleball import CSV) against venues already in the DB.
 * Pure functions only — no DB access — so the matching rules can be tuned
 * and tested without touching any environment.
 */
import * as fs from 'fs';
import { removeVietnameseTones } from '../../src/common/utils/string.utils';

/** Minimal quoted-CSV parser returning header-keyed records. */
export function readCsv(file: string): Record<string, string>[] {
  const content = fs.readFileSync(file, 'utf-8').replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"' && content[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows.filter((r) => r.some((c) => c.trim()));
  return data.map((cells) =>
    Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? '').trim()]))
  );
}

export function toCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Lowercase, tone-free, punctuation collapsed to single spaces. */
export function norm(value: string | null | undefined): string {
  return removeVietnameseTones((value ?? '').normalize('NFC').toLowerCase())
    .replace(/[^a-z0-9/\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STREET_ALIASES: [RegExp, string][] = [
  [/\bcmt8\b|\bcmt 8\b/g, 'cach mang thang 8'],
  [/\bql ?(\d+)/g, 'quoc lo $1'],
  [/\bng\b/g, 'nguyen'],
  [/\bxvnt\b/g, 'xo viet nghe tinh'],
  [/\bdbp\b/g, 'dien bien phu'],
];

/** Ward name without its "Phường/Xã" prefix, for comparing newDistrict values. */
export function wardKey(ward: string | null | undefined): string {
  return norm(ward).replace(/^(phuong|xa|p|dac khu)\s+/, '');
}

export interface StreetKey {
  house: string; // e.g. "189b/a30"
  baseHouse: string; // leading number only, e.g. "189"
  street: string; // e.g. "cong quynh"
  generic: boolean; // "duong so 9"-style names repeat across wards
}

/**
 * Split a street address ("189B/A30 Cống Quỳnh", "Tầng 10, Samco Building,
 * 121 Cô Giang") into house number + street name. Returns null when no
 * house number can be found (e.g. "Lan Anh Village").
 */
export function parseStreet(raw: string | null | undefined): StreetKey | null {
  const clean = (part: string) => {
    let s = norm(part);
    for (const [re, to] of STREET_ALIASES) s = s.replace(re, to);
    return s
      .replace(/\b(tang|lau) [a-z0-9]+\b/g, ' ')
      .replace(/\b(so|doi dien|ke ben|canh|hem|kiet|ngo)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  // Only the comma segment holding the house number is the street: DB rows
  // often keep a bare ward after it ("1A222/1 Đ. Vĩnh Lộc, Tân Vĩnh Lộc").
  const segments = (raw ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .split(/,\s*(?:phường|xã|p\.|quận|thành phố|tp)/i)[0]
    .split(',')
    .map(clean);
  let m: RegExpMatchArray | null = null;
  for (let i = 0; i < segments.length && !m; i++) {
    m = segments[i].match(/(?:^|\s)(\d[0-9a-z/\-]*)\s+(.+)$/);
    if (!m && /(?:^|\s)\d[0-9a-z/\-]*$/.test(segments[i]) && segments[i + 1]) {
      // "Số 4, Đường số 65": house number and street in separate segments
      m = `${segments[i]} ${segments[i + 1]}`.match(/(?:^|\s)(\d[0-9a-z/\-]*)\s+(.+)$/);
    }
  }
  if (!m) return null;
  const street = m[2]
    .replace(/^(duong|d|pho)\s+/, '')
    .split(/\s(?:phuong|p|quan|q|tp|khu|kdt|kdc|kp)\b/)[0]
    .trim();
  if (!street) return null;
  return {
    house: m[1],
    baseHouse: m[1].match(/^\d+/)?.[0] ?? m[1],
    street,
    generic: /^(so )?\d+[a-z]?$|^[a-z]\d+$/.test(street),
  };
}

/** Every 9-11 digit phone number found in the given texts, normalised to 0xxxxxxxxx. */
export function phonesOf(...texts: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    for (const m of (t ?? '').replace(/[.\s-]/g, '').matchAll(/(?:\+?84|0)\d{9}/g)) {
      out.add(m[0].replace(/^\+?84/, '0'));
    }
  }
  return [...out];
}

const GENERIC_NAME_WORDS = new Set(
  (
    'san cau long pickleball pickle ball badminton clb cau lac bo club sport sports ' +
    'center centre complex coffee tea house cafe va and the of tennis golf basketball ' +
    'arena court courts nha thi dau tt trung tam the thao chi nhanh cn co so cs cum ' +
    'quan q phuong p tp thanh pho hcm ho chi minh sai gon academy station clubhouse ' +
    'mai che ngoai troi tieu chuan hkd ho kinh doanh'
  ).split(' ')
);

/**
 * Brand tokens of a venue name: generic sport/venue words and known place
 * names stripped, so "PooC Pickleball & Badminton Gò Vấp" -> ["pooc"].
 */
export function brandTokens(name: string, placeNames: string[]): string[] {
  let s = ` ${norm(name).replace(/[/\-]/g, ' ')} `;
  for (const place of placeNames) s = s.split(` ${place} `).join(' ');
  return s
    .split(' ')
    .filter((t) => t && !GENERIC_NAME_WORDS.has(t) && !/^\d{1,2}$/.test(t));
}

export function brandSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = [...sa].filter((t) => sb.has(t)).length;
  return inter / new Set([...sa, ...sb]).size;
}

/** Place names (old districts + old/new wards, tone-free) from the admin mapping CSV. */
export function loadPlaceNames(mappingCsv: string): string[] {
  const names = new Set<string>();
  for (const line of fs.readFileSync(mappingCsv, 'utf-8').split('\n').slice(1)) {
    const c = line.split(',');
    if (c.length < 10) continue;
    for (const v of [c[3], c[5], c[9]]) {
      const k = norm(v).replace(/^(quan|huyen|thanh pho|thi xa|phuong|xa|thi tran)\s+/, '');
      if (k && !/^\d+$/.test(k)) names.add(k);
    }
  }
  // longest first so "binh trung tay" is removed before "binh trung"
  return [...names].sort((a, b) => b.length - a.length);
}

export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
