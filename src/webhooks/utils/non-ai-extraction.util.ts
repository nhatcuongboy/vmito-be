import { SportType } from '@prisma/client';
import { ExtractedSessionDto } from '../../ai/dto/extract-session.dto';
import { SPORT_DETECTION_KEYWORDS } from '../../common/utils/sport.utils';
import { removeVietnameseTones } from '../../common/utils/string.utils';

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const VIETNAM_UTC_OFFSET = '+07:00';
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_LOCATION_LENGTH = 80;

// "social" is the established shorthand for a pickleball social-play session in
// the crawled groups (mirrors the deterministic rule in GeminiService).
const PICKLEBALL_SOCIAL_PATTERN =
  /(?:^|[^\p{L}\p{N}_])social(?:$|[^\p{L}\p{N}_])/iu;

// Tone-less recruitment vocabulary. Compared against a punctuation-normalized
// haystack so accents and sloppy typing do not defeat the match.
const RECRUITMENT_KEYWORDS = [
  'tuyen vang lai',
  'tuyen nguoi',
  'tuyen quan',
  'can tuyen',
  'can them',
  'can nguoi',
  'tim nguoi',
  'tim ban',
  'tim keo',
  'giao luu',
  'vang lai',
  'thieu nguoi',
  'ghep keo',
  'nhan keo',
  'ru nhau',
  'choi cung',
  'dang ky tham gia',
  'slot',
];

// Non-recruitment signals. Order matters: the first hit wins and its reason is
// surfaced in the crawler log so false negatives can be spotted.
const NON_RECRUITMENT_KEYWORDS: ReadonlyArray<{
  keyword: string;
  reason: string;
}> = [
  { keyword: 'cho thue san', reason: 'court rental listing' },
  { keyword: 'san trong', reason: 'court availability listing' },
  { keyword: 'lich trong', reason: 'court availability listing' },
  { keyword: 'ban vot', reason: 'equipment sale' },
  { keyword: 'ban cau', reason: 'equipment sale' },
  { keyword: 'khoa hoc', reason: 'class ad' },
  { keyword: 'lop hoc', reason: 'class ad' },
  { keyword: 'day cau long', reason: 'class ad' },
  { keyword: 'huan luyen vien', reason: 'class ad' },
  { keyword: 'giai dau', reason: 'tournament announcement' },
  { keyword: 'quang cao', reason: 'advertisement' },
  { keyword: 'dich vu', reason: 'service ad' },
  { keyword: 'ep vot', reason: 'service ad' },
  { keyword: 'quan can', reason: 'service ad' },
];

// "HHh", "HHhMM", "HH:MM", "H gio" etc. Captures the hour and (optional) minute.
const TIME_PATTERN = /(\d{1,2})\s*(?:h|g|giờ|:)\s*(\d{1,2})?/gi;
// Explicit calendar date, slash-separated (dd/mm[/yyyy]) or with a year.
const DATE_PATTERN = /(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?/;

const LOCATION_PATTERN =
  /(?:^|[\s\p{P}])(?:địa điểm|điểm hẹn|sân thi đấu|cụm sân|câu lạc bộ|clb|nhà thi đấu|trung tâm|tại|ở|sân)\s*[:-]?\s*([^\n\r,;.!?()[\]]{3,80})/iu;

const WEEKDAYS: Record<string, number> = {
  'chu nhat': 0,
  'thu 2': 1,
  'thu 3': 2,
  'thu 4': 3,
  'thu 5': 4,
  'thu 6': 5,
  'thu 7': 6,
};

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Normalize text into a punctuation-delimited, tone-less haystack so that
 * multi-word keyword matching is robust ("tuyển vãng lai" → " tuyen vang lai ").
 */
const toHaystack = (text: string): string =>
  ` ${removeVietnameseTones(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;

const haystackIncludes = (haystack: string, keyword: string): boolean =>
  haystack.includes(` ${keyword} `);

/** Current calendar date in Vietnam, independent of the host timezone. */
const getVietnamToday = (): {
  year: number;
  month: number;
  day: number;
} => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
};

/**
 * Build an ISO timestamp from Vietnam-local parts. Returns undefined when the
 * parts do not form a real date (e.g. month 20 from "18-20").
 */
const toVietnamIso = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): string | undefined => {
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return undefined;
  }
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${VIETNAM_UTC_OFFSET}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

/** Normalize a Vietnamese phone number found in free text to 0xxxxxxxxx. */
const extractPhone = (content: string): string | undefined => {
  const match = content.match(/(?:\+?84|0)(?:[\s.-]?\d){9,10}/);
  if (!match) return undefined;
  let digits = match[0].replace(/\D/g, '');
  if (digits.startsWith('84')) digits = `0${digits.slice(2)}`;
  if (!digits.startsWith('0') && digits.length === 9) digits = `0${digits}`;
  return digits.length >= 10 ? digits : undefined;
};

const detectSport = (
  content: string,
  haystack: string
): SportType | undefined => {
  if (PICKLEBALL_SOCIAL_PATTERN.test(content)) return SportType.PICKLEBALL;
  for (const sport of Object.values(SportType)) {
    const keywords = SPORT_DETECTION_KEYWORDS[sport] ?? [];
    if (
      keywords.some((keyword) =>
        haystackIncludes(haystack, removeVietnameseTones(keyword).toLowerCase())
      )
    ) {
      return sport;
    }
  }
  return undefined;
};

/**
 * Parse a start (and optional end) time from free text. Only HH[:MM] tokens
 * count, so phone numbers and court numbers are ignored. A token wrapped in
 * evening context ("tối"/"chiều"/"đêm"/pm) rolls the hour into the afternoon.
 */
const extractTimeRange = (
  content: string
): {
  startHour?: number;
  startMinute?: number;
  endHour?: number;
  endMinute?: number;
} => {
  const results: Array<{ hour: number; minute: number }> = [];
  for (const match of content.matchAll(TIME_PATTERN)) {
    let hour = Number.parseInt(match[1], 10);
    const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
    if (hour > 23 || minute > 59) continue;

    // Look on both sides of the token: Vietnamese places the period marker
    // after it ("7h30 chiều") as often as before it ("tối nay 19h").
    const start = Math.max(0, (match.index ?? 0) - 8);
    const end = (match.index ?? 0) + match[0].length + 8;
    const context = content.slice(start, end).toLowerCase();
    const evening = /tối|chieu|chiều|đêm|dem|pm/.test(context);
    if (evening && hour > 0 && hour < 12) hour += 12;

    results.push({ hour, minute });
    if (results.length === 2) break;
  }
  return {
    startHour: results[0]?.hour,
    startMinute: results[0]?.minute,
    endHour: results[1]?.hour,
    endMinute: results[1]?.minute,
  };
};

/** Resolve the day offset for "hôm nay"/"ngày mai"/"mốt"/weekday mentions. */
const extractRelativeDayOffset = (haystack: string): number | undefined => {
  if (/( hom nay | toi nay | chieu nay | sang nay )/.test(haystack)) return 0;
  if (/( ngay mai | toi mai | chieu mai | sang mai )/.test(haystack)) return 1;
  if (/( ngay mot | toi mot | chieu mot )/.test(haystack)) return 2;

  const today = new Date();
  for (const [label, target] of Object.entries(WEEKDAYS)) {
    if (haystackIncludes(haystack, label)) {
      const current = today.getDay();
      return (target - current + 7) % 7;
    }
  }
  return undefined;
};

/** Best-effort location: the phrase following a venue/venue-intro keyword. */
const extractLocation = (content: string): string | undefined => {
  const match = content.match(LOCATION_PATTERN);
  const raw = match?.[1];
  if (!raw) return undefined;

  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/\s*(?:nhé|nha|nhe|mn|mọi người|ạ|a)$/iu, '')
    .trim();
  if (cleaned.length < 3) return undefined;
  return cleaned.slice(0, MAX_LOCATION_LENGTH);
};

/**
 * Deterministic, AI-free extraction for crawled Facebook posts.
 *
 * Used when `CRAWLER_USE_AI=false`. It mirrors the intent of the Gemini prompt
 * (classify recruitment vs. ad, pull the fields a regex can trust) but is
 * intentionally conservative: fields it cannot read reliably are left
 * undefined and fall back to the defaults in `SessionsService.createCrawledSession`.
 * The caller still runs the same completeness gate, so time/location are
 * required before a post becomes a session.
 */
export const buildNonAiExtraction = (
  rawContent: string
): ExtractedSessionDto => {
  const content = (rawContent ?? '').trim();
  const haystack = toHaystack(content);

  // Gate 1 (classification): explicit ad signals win, otherwise require a
  // recruitment phrase. Uncertain posts stay false, matching the AI prompt's
  // "prefer false" bias so the public feed is not polluted.
  const nonRecruitment = NON_RECRUITMENT_KEYWORDS.find(({ keyword }) =>
    haystackIncludes(haystack, keyword)
  );
  const isRecruitmentPost =
    !nonRecruitment &&
    RECRUITMENT_KEYWORDS.some((keyword) => haystackIncludes(haystack, keyword));

  const { startHour, startMinute, endHour, endMinute } =
    extractTimeRange(content);

  const today = getVietnamToday();
  const explicitDate = content.match(DATE_PATTERN);
  let year = today.year;
  let month = today.month;
  let day = today.day;
  let hasDate = false;
  if (explicitDate) {
    const parsedMonth = Number.parseInt(explicitDate[2], 10);
    const parsedDay = Number.parseInt(explicitDate[1], 10);
    if (parsedMonth <= 12 && parsedDay <= 31) {
      month = parsedMonth;
      day = parsedDay;
      if (explicitDate[3]) {
        year = Number.parseInt(explicitDate[3], 10);
        if (year < 100) year += 2000;
      }
      hasDate = true;
    }
  } else {
    const offset = extractRelativeDayOffset(haystack);
    if (offset !== undefined) {
      const shifted = new Date(
        Date.UTC(today.year, today.month - 1, today.day)
      );
      shifted.setUTCDate(shifted.getUTCDate() + offset);
      year = shifted.getUTCFullYear();
      month = shifted.getUTCMonth() + 1;
      day = shifted.getUTCDate();
      hasDate = true;
    }
  }

  let startTime: string | undefined;
  let endTime: string | undefined;
  // A start time is only emitted when the post actually states a clock time —
  // never fabricated. If the resolved moment is already in the past, roll to
  // the next day so a "18h" post seen this evening does not import as expired.
  if (startHour !== undefined) {
    startTime = toVietnamIso(year, month, day, startHour, startMinute ?? 0);
    if (startTime && !hasDate && new Date(startTime).getTime() < Date.now()) {
      const rolled = new Date(
        Date.UTC(year, month - 1, day) + 24 * 60 * 60 * 1000
      );
      startTime = toVietnamIso(
        rolled.getUTCFullYear(),
        rolled.getUTCMonth() + 1,
        rolled.getUTCDate(),
        startHour,
        startMinute ?? 0
      );
    }
    if (startTime && endHour !== undefined) {
      endTime = toVietnamIso(year, month, day, endHour, endMinute ?? 0);
      if (endTime && new Date(endTime) <= new Date(startTime)) {
        endTime = undefined;
      }
    }
  }

  const location = extractLocation(content);

  // SINGLES/DOUBLES only when the post says so — mirrors the AI prompt.
  const defaultMatchType = haystackIncludes(haystack, 'don')
    ? 'SINGLES'
    : haystackIncludes(haystack, 'doi')
      ? 'DOUBLES'
      : undefined;

  return {
    isRecruitmentPost,
    nonRecruitmentReason: nonRecruitment?.reason,
    sportType: detectSport(content, haystack),
    description: content ? content.slice(0, MAX_DESCRIPTION_LENGTH) : undefined,
    location,
    venue: location ? { name: location } : undefined,
    startTime,
    endTime,
    hostPhone: extractPhone(content),
    defaultMatchType,
  };
};
