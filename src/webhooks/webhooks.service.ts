import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiService } from '../ai/gemini.service';
import { SessionsService } from '../sessions/sessions.service';
import { ExtractedSessionDto } from '../ai/dto/extract-session.dto';
import { ApifyPostItem, ApifyWebhookPayload } from './dto/apify-webhook.dto';

export interface IngestResult {
  received: number;
  imported: number;
  skippedDuplicate: number;
  skippedNonRecruitment: number;
  /** Post had no usable URL or no text to extract from. */
  skippedNoise: number;
  /** Post looked like a session but lacked a start time and/or a location. */
  skippedIncomplete: number;
  failed: number;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiService: GeminiService,
    private readonly sessionsService: SessionsService
  ) {}

  /**
   * Ingest crawled Facebook posts from an Apify run: for each post, run Gemini
   * extraction (which also classifies whether the post is actually a player
   * recruitment — class ads, court-rental listings, and equipment sales are
   * rejected), drop posts that are noise or incomplete, and create a view-only
   * crawled session. Dedup is enforced downstream via externalUrl.
   *
   * This completeness bar applies to the crawl path only. Sessions a host
   * creates by hand go through SessionsService.create, which has its own
   * validation and, unlike these rows, stays editable afterwards.
   *
   * Apify's native webhook only sends run metadata, so when the payload carries
   * a `resource.defaultDatasetId` we fetch the actual items from the Apify
   * dataset API. Inline `items`/`data`/bare-array payloads (e.g. via Make/n8n)
   * are also supported.
   *
   * @param accountId - Optional Apify account identifier passed via the
   *   `?account=` query param on the webhook URL. Used to resolve the correct
   *   API token when multiple Apify accounts are in rotation.
   */
  async ingestApifyPosts(
    payload: ApifyWebhookPayload,
    accountId?: string
  ): Promise<IngestResult> {
    const runId = (payload?.resource as Record<string, unknown>)?.id as
      | string
      | undefined;
    const eventType = payload?.eventType ?? 'unknown';
    this.logger.log(
      `[Apify] Webhook received | account=${accountId ?? 'default'} | event=${eventType}` +
        (runId ? ` | runId=${runId}` : '')
    );

    const items = await this.resolveItems(payload, accountId);
    const result: IngestResult = {
      received: items.length,
      imported: 0,
      skippedDuplicate: 0,
      skippedNonRecruitment: 0,
      skippedNoise: 0,
      skippedIncomplete: 0,
      failed: 0,
    };

    for (const item of items) {
      const content = item.text || item.message || item.postText;
      const externalUrl = this.resolveExternalUrl(item);

      if (!externalUrl || !content?.trim()) {
        result.skippedNoise++;
        continue;
      }

      try {
        const extracted =
          await this.geminiService.extractSessionFromArticle(content);

        // Gate 1: the model classifies post intent. Class ads, court-rental
        // listings, equipment sales, and tournament announcements come back
        // isRecruitmentPost=false and must not become sessions.
        if (!extracted.isRecruitmentPost) {
          result.skippedNonRecruitment++;
          this.logger.debug(
            `Skipped non-recruitment post ${externalUrl}: ${
              extracted.nonRecruitmentReason || '(no reason given)'
            }`
          );
          continue;
        }

        // Gate 2: heuristic safety net for the classifier being wrong the
        // other way — a real recruitment post must state both when and where;
        // the model returns nulls for fields it can't determine.
        const missing = this.missingSessionFields(extracted);
        if (missing.length > 0) {
          result.skippedIncomplete++;
          this.logger.debug(
            `Skipped incomplete post ${externalUrl}: missing ${missing.join(', ')}`
          );
          continue;
        }

        const source = this.resolveSource(item);
        const session = await this.sessionsService.createCrawledSession(
          extracted,
          externalUrl,
          source,
          {
            authorName: item.user?.name,
            authorUrl: item.user?.id
              ? `https://www.facebook.com/${item.user.id}`
              : undefined,
            authorAvatar: item.user?.profilePic,
            groupUrl: item.facebookUrl || item.groupUrl,
            coverPhoto: this.resolveImage(item),
          }
        );

        // createCrawledSession returns null when the post was already imported
        if (session) {
          result.imported++;
        } else {
          result.skippedDuplicate++;
        }
      } catch (err) {
        result.failed++;
        this.logger.warn(
          `Failed to import crawled post ${externalUrl}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    this.logger.log(
      `Apify ingest [account=${accountId ?? 'default'}]: ` +
        `received=${result.received} imported=${result.imported} ` +
        `dup=${result.skippedDuplicate} nonRecruitment=${result.skippedNonRecruitment} ` +
        `noise=${result.skippedNoise} incomplete=${result.skippedIncomplete} ` +
        `failed=${result.failed}`
    );
    return result;
  }

  /**
   * Resolve the list of post items. Prefers inline items (Make/n8n style);
   * otherwise fetches them from the Apify dataset referenced by the run event.
   */
  private async resolveItems(
    payload: ApifyWebhookPayload,
    accountId?: string
  ): Promise<ApifyPostItem[]> {
    const inline = this.extractInlineItems(payload);
    if (inline.length > 0) return inline;

    const datasetId = payload?.resource?.defaultDatasetId;
    if (datasetId) {
      return this.fetchDatasetItems(datasetId, accountId);
    }

    this.logger.warn(
      'Apify webhook payload had neither inline items nor a dataset id.'
    );
    return [];
  }

  /** Unwrap directly-embedded items from non-Apify-native payload shapes. */
  private extractInlineItems(payload: ApifyWebhookPayload): ApifyPostItem[] {
    if (Array.isArray(payload)) return payload as ApifyPostItem[];
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.data)) return payload.data;
    return [];
  }

  /** Fetch the crawled posts from the Apify dataset API using the resolved token. */
  private async fetchDatasetItems(
    datasetId: string,
    accountId?: string
  ): Promise<ApifyPostItem[]> {
    const token = this.resolveToken(accountId);
    this.logger.log(
      `[Apify] Fetching dataset | account=${accountId ?? 'default'} | datasetId=${datasetId}`
    );
    const url =
      `https://api.apify.com/v2/datasets/${datasetId}/items` +
      `?clean=true&format=json&token=${token}`;
    const res = await fetch(url);
    if (!res.ok) {
      this.logger.error(
        `[Apify] Dataset fetch FAILED | account=${accountId ?? 'default'} | datasetId=${datasetId} | status=${res.status} ${res.statusText}`
      );
      throw new Error(
        `Apify dataset fetch failed (${res.status} ${res.statusText}).`
      );
    }
    const data = (await res.json()) as unknown;
    const items = Array.isArray(data) ? (data as ApifyPostItem[]) : [];
    this.logger.log(
      `[Apify] Dataset fetched | account=${accountId ?? 'default'} | datasetId=${datasetId} | items=${items.length}`
    );
    return items;
  }

  /**
   * Resolve the Apify API token for a given account.
   *
   * Resolution order:
   *   1. APIFY_TOKENS JSON map keyed by `accountId`  (multi-account rotation)
   *   2. APIFY_TOKEN single env var                  (legacy / single-account)
   *
   * Throws if no token is found so the error surfaces clearly in logs.
   */
  private resolveToken(accountId?: string): string {
    const tokensRaw = this.configService.get<string>('apify.tokens');
    if (tokensRaw) {
      try {
        const map = JSON.parse(tokensRaw) as Record<string, string>;
        if (accountId && map[accountId]) {
          this.logger.log(
            `[Apify] Token resolved | account=${accountId} | source=APIFY_TOKENS`
          );
          return map[accountId];
        }
        if (accountId) {
          this.logger.warn(
            `[Apify] Token NOT found | account=${accountId} | source=APIFY_TOKENS → falling back to APIFY_TOKEN`
          );
        }
      } catch {
        this.logger.warn(
          '[Apify] APIFY_TOKENS is not valid JSON; falling back to APIFY_TOKEN.'
        );
      }
    }

    const fallback = this.configService.get<string>('apify.token');
    if (!fallback) {
      throw new Error(
        'No Apify token found. Set APIFY_TOKENS (JSON map) or APIFY_TOKEN.'
      );
    }
    this.logger.log('[Apify] Token resolved | source=APIFY_TOKEN (fallback)');
    return fallback;
  }

  /**
   * Resolve the canonical Facebook post URL (used both as the dedup key and the
   * "Xem bài gốc" link). Falls back to a stable synthesized URL derived from the
   * group URL + a content hash so text-only posts still dedup deterministically.
   */
  private resolveExternalUrl(item: ApifyPostItem): string | null {
    const direct =
      item.postUrl ||
      item.url ||
      item.topLevelUrl ||
      item.postLink ||
      item.link ||
      item.permalink ||
      item.permalinkUrl;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();

    for (const att of item.attachments || []) {
      const u =
        att?.permalink_url || att?.url || att?.canonical_uri_with_fallback;
      if (typeof u === 'string' && u.trim()) return u.trim();
    }

    const group = item.facebookUrl || item.groupUrl;
    const text = item.text || item.message || item.postText || '';
    if (typeof group === 'string' && group.trim() && text.trim()) {
      const base = group.trim().replace(/\/?$/, '/');
      return `${base}?vmitoPost=${this.simpleHash(text)}`;
    }
    return null;
  }

  /** Pick the best single image URL from the post's attachments (hotlinked). */
  private resolveImage(item: ApifyPostItem): string | undefined {
    for (const att of item.attachments || []) {
      const u =
        att?.image?.uri ||
        att?.thumbnailImage?.uri ||
        att?.preferred_thumbnail?.image?.uri ||
        att?.thumbnail;
      if (typeof u === 'string' && u.trim()) return u.trim();
    }
    return undefined;
  }

  /** Human-readable source label: explicit group title, else the group slug. */
  private resolveSource(item: ApifyPostItem): string {
    if (item.groupTitle?.trim()) return item.groupTitle.trim();
    if (item.groupName?.trim()) return item.groupName.trim();
    const url = item.facebookUrl || item.groupUrl;
    const slug =
      typeof url === 'string'
        ? url.match(/\/groups\/([^/?#]+)/)?.[1]
        : undefined;
    return slug || 'facebook';
  }

  /** Deterministic non-crypto hash for dedup keys (no Date/Math.random). */
  private simpleHash(input: string): string {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }

  /**
   * Heuristic noise filter used because the Gemini prompt returns nulls for
   * fields it cannot determine. A crawled session must carry BOTH a start time
   * and a location — the two axes the discovery feed is built on.
   *
   * Both are required rather than either-or because a crawled session cannot be
   * repaired after the fact: update/cancel are blocked for isCrawled rows, so a
   * half-empty import stays half-empty until the nightly cleanup removes it.
   * Skipping is the recoverable side of that trade — no row means no externalUrl
   * dedup key, so a later crawl run simply re-processes the post.
   *
   * Missing time is the more damaging half: createCrawledSession substitutes
   * `new Date()` for a null startTime, so such a post would be published with a
   * fabricated "starts now" that appears nowhere in the source.
   */
  private missingSessionFields(extracted: ExtractedSessionDto): string[] {
    const missing: string[] = [];
    if (!extracted.startTime) missing.push('startTime');
    const hasVenue = !!(
      extracted.venue?.name ||
      extracted.venue?.address ||
      extracted.location
    );
    if (!hasVenue) missing.push('venue');
    return missing;
  }
}
