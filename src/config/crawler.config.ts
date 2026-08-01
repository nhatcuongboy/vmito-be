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
  },
});
