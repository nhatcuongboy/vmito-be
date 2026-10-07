const MAX_EXCERPT_LENGTH = 160;

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * Plain-text preview of a club description for an activity post.
 *
 * Club descriptions are stored as editor HTML. A feed card shows two lines of
 * muted text, so the post keeps a short plain-text excerpt instead of copying
 * the whole markup into `Post.metadata`. Returns null when nothing readable is
 * left, so the card can omit the line rather than render an empty one.
 */
export function toDescriptionExcerpt(
  html: string | null | undefined
): string | null {
  if (!html) return null;

  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    // Paragraph / line breaks must not glue neighbouring words together.
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        return String.fromCodePoint(parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith('#')) {
        return String.fromCodePoint(parseInt(entity.slice(1), 10));
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;
  if (text.length <= MAX_EXCERPT_LENGTH) return text;

  // Cut on a word boundary when there is one near the limit, so the ellipsis
  // does not land mid-word.
  const cut = text.slice(0, MAX_EXCERPT_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  const base =
    lastSpace > MAX_EXCERPT_LENGTH * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}
