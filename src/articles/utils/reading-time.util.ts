const WORDS_PER_MINUTE = 200;
// CJK text has no spaces, so word counting under-reports it badly. Readers
// average roughly 350 characters per minute for Chinese.
const CJK_CHARS_PER_MINUTE = 350;
const CJK_PATTERN = /[㐀-䶿一-鿿豈-﫿]/g;

/**
 * Estimates reading time from rich-text HTML produced by the editor.
 * Always returns at least 1 so the UI never shows "0 min read".
 */
export function estimateReadingTimeMinutes(html: string): number {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return 1;

  const cjkCharCount = (text.match(CJK_PATTERN) ?? []).length;
  const latinWordCount = text
    .replace(CJK_PATTERN, ' ')
    .split(/\s+/)
    .filter(Boolean).length;

  const minutes =
    latinWordCount / WORDS_PER_MINUTE + cjkCharCount / CJK_CHARS_PER_MINUTE;

  return Math.max(1, Math.round(minutes));
}
