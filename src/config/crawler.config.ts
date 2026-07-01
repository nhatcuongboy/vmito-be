export default () => ({
  apify: {
    webhookSecret: process.env.APIFY_WEBHOOK_SECRET,
    // API token used to fetch dataset items when Apify's native webhook only
    // sends run metadata (resource.defaultDatasetId).
    token: process.env.APIFY_TOKEN,
  },
  crawler: {
    botUserId: process.env.CRAWLER_BOT_USER_ID,
  },
});
