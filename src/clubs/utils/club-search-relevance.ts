import { removeVietnameseTones } from '../../common/utils/string.utils';

// Tiers are far enough apart that token bonuses never promote a lower tier
// over a higher one.
const EXACT_NAME = 1000;
const NAME_PREFIX = 500;
const NAME_PHRASE = 300;
const EXACT_TOKEN = 50;
const PARTIAL_TOKEN = 20;

const normalize = (value: string): string =>
  removeVietnameseTones(value).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * How well a club's name matches a search keyword; higher is better.
 *
 * The browse query also matches `searchTerms` and `description`, so a club can
 * be a valid hit with a score of 0 (e.g. the keyword only appears in its
 * description). Those rank after every name match.
 */
export function scoreClubSearchRelevance(
  name: string,
  keyword: string
): number {
  const normalizedName = normalize(name);
  const normalizedKeyword = normalize(keyword);
  if (!normalizedKeyword) return 0;

  if (normalizedName === normalizedKeyword) return EXACT_NAME;

  let score = 0;
  if (normalizedName.startsWith(normalizedKeyword)) score += NAME_PREFIX;
  if (normalizedName.includes(normalizedKeyword)) score += NAME_PHRASE;

  const nameTokens = normalizedName.split(' ');
  for (const keywordToken of normalizedKeyword.split(' ')) {
    if (nameTokens.includes(keywordToken)) {
      score += EXACT_TOKEN;
    } else if (nameTokens.some((token) => token.includes(keywordToken))) {
      score += PARTIAL_TOKEN;
    }
  }
  return score;
}
