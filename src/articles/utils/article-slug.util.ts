// Grouped as [base letter, every accented form] so the table stays readable
// and prettier doesn't explode it into one line per character.
const DIACRITIC_GROUPS: ReadonlyArray<readonly [string, string]> = [
  ['a', 'àáảãạăằắẳẵặâầấẩẫậ'],
  ['e', 'èéẻẽẹêềếểễệ'],
  ['i', 'ìíỉĩị'],
  ['o', 'òóỏõọôồốổỗộơờớởỡợ'],
  ['u', 'ùúủũụưừứửữự'],
  ['y', 'ỳýỷỹỵ'],
  ['d', 'đ'],
];

const VIETNAMESE_MAP = new Map<string, string>(
  DIACRITIC_GROUPS.flatMap(([plain, accented]) =>
    Array.from(accented, (char) => [char, plain] as const)
  )
);

const MAX_SLUG_LENGTH = 90;

/**
 * Turns a title into a URL-safe slug. Vietnamese diacritics are transliterated
 * rather than stripped so "Giải đấu" becomes "giai-dau", not "gi-u".
 *
 * CJK titles (the `cn` locale) have no ASCII form, so they collapse to an empty
 * string here — callers must fall back to a generated suffix in that case.
 */
export function slugifyTitle(title: string): string {
  const lowered = title.toLowerCase().trim();
  const transliterated = Array.from(lowered)
    .map((char) => VIETNAMESE_MAP.get(char) ?? char)
    .join('');

  return transliterated
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip any remaining combining marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

/**
 * Builds a slug that does not collide with an existing one. `isTaken` is
 * injected so this stays a pure function that the service can unit test.
 */
export async function buildUniqueSlug(
  desired: string,
  isTaken: (slug: string) => Promise<boolean>
): Promise<string> {
  const base = slugifyTitle(desired) || `article-${Date.now().toString(36)}`;

  if (!(await isTaken(base))) return base;

  // Bounded so a pathological number of collisions can't spin forever.
  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}
