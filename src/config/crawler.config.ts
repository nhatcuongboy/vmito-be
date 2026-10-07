/**
 * Tolerant boolean parser for env flags. Anything that is not explicitly
 * falsy (`false`/`0`/`no`/`off`, case-insensitive) keeps the default.
 */
const parseBoolean = (
  value: string | undefined,
  fallback: boolean
): boolean => {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return !['false', '0', 'no', 'off'].includes(normalized);
};

export default () => ({
  apify: {
    webhookSecret: process.env.APIFY_WEBHOOK_SECRET,
    // Single API token (legacy / single-account setup).
    token: process.env.APIFY_TOKEN,
    // Multi-account token map (JSON): {"account_a":"token1","account_b":"token2",...}
    // When set, each actor webhook must include ?account=<accountId> so the
    // backend can pick the correct token for the dataset fetch.
    tokens: process.env.APIFY_TOKENS,
  },
  crawler: {
    botUserId: process.env.CRAWLER_BOT_USER_ID,
    // Kill-switch for the Gemini extraction step in the Facebook crawl →
    // session pipeline. When false, crawled posts are parsed with a
    // deterministic (AI-free) extractor instead of calling Gemini.
    useAi: parseBoolean(process.env.CRAWLER_USE_AI, false),
  },
});
