/**
 * A single attachment on a crawled Facebook post (photo/video). We only care
 * about the permalink and thumbnail; the Apify actor emits many extra fields.
 */
export interface ApifyAttachment {
  permalink_url?: string;
  url?: string;
  canonical_uri_with_fallback?: string;
  thumbnail?: string;
  image?: { uri?: string };
  [key: string]: unknown;
}

/**
 * Shape of a single crawled Facebook post from the Apify Facebook Groups
 * Scraper. Field names mirror the real actor output; several aliases are
 * accepted so the mapping survives minor actor/version differences.
 */
export interface ApifyPostItem {
  /** Group URL that was scraped, e.g. https://facebook.com/groups/<slug>/ */
  facebookUrl?: string;
  groupUrl?: string;
  /** Post permalink aliases (present on some actors/versions). */
  postUrl?: string;
  url?: string;
  topLevelUrl?: string;
  postLink?: string;
  link?: string;
  permalink?: string;
  permalinkUrl?: string;
  /** Raw post text fed into Gemini extraction. */
  text?: string;
  message?: string;
  postText?: string;
  /** Source group name aliases (not always present). */
  groupTitle?: string;
  groupName?: string;
  /** Attachments — used to recover a per-post permalink for text+media posts. */
  attachments?: ApifyAttachment[];
  user?: { id?: string; name?: string; profilePic?: string };
  [key: string]: unknown;
}

/**
 * Metadata about the finished Apify run, sent by Apify's native webhook.
 * `defaultDatasetId` is used to fetch the crawled items from the Apify API.
 */
export interface ApifyRunResource {
  defaultDatasetId?: string;
  [key: string]: unknown;
}

/**
 * Apify webhook payload. Apify's native webhook sends run metadata under
 * `resource` (NOT the dataset items) — the service fetches items from the
 * dataset API. If an intermediary (Make/n8n) posts items directly, `items`/
 * `data`/a bare array are also accepted.
 */
export interface ApifyWebhookPayload {
  items?: ApifyPostItem[];
  data?: ApifyPostItem[];
  resource?: ApifyRunResource;
  eventType?: string;
  [key: string]: unknown;
}
