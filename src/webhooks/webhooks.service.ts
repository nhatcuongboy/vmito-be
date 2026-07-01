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
  skippedNoise: number;
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
   * extraction, filter out noise (ads/sales/non-sessions), and create a
   * view-only crawled session. Dedup is enforced downstream via externalUrl.
   *
   * Apify's native webhook only sends run metadata, so when the payload carries
   * a `resource.defaultDatasetId` we fetch the actual items from the Apify
   * dataset API. Inline `items`/`data`/bare-array payloads (e.g. via Make/n8n)
   * are also supported.
   */
  async ingestApifyPosts(payload: ApifyWebhookPayload): Promise<IngestResult> {
    const items = await this.resolveItems(payload);
    const result: IngestResult = {
      received: items.length,
      imported: 0,
      skippedDuplicate: 0,
      skippedNoise: 0,
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

        // Noise filter: a real recruitment session must have at least a time
        // or a venue. Ads / racket sales / generic posts lack both.
        if (!this.isValidSession(extracted)) {
          result.skippedNoise++;
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
      `Apify ingest: received=${result.received} imported=${result.imported} ` +
        `dup=${result.skippedDuplicate} noise=${result.skippedNoise} ` +
        `failed=${result.failed}`
    );
    return result;
  }

  /**
   * Resolve the list of post items. Prefers inline items (Make/n8n style);
   * otherwise fetches them from the Apify dataset referenced by the run event.
   */
  private async resolveItems(
    payload: ApifyWebhookPayload
  ): Promise<ApifyPostItem[]> {
    const inline = this.extractInlineItems(payload);
    if (inline.length > 0) return inline;

    const datasetId = payload?.resource?.defaultDatasetId;
    if (datasetId) {
      return this.fetchDatasetItems(datasetId);
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

  /** Fetch the crawled posts from the Apify dataset API using APIFY_TOKEN. */
  private async fetchDatasetItems(datasetId: string): Promise<ApifyPostItem[]> {
    const token = this.configService.get<string>('apify.token');
    if (!token) {
      throw new Error(
        'APIFY_TOKEN is not configured; cannot fetch dataset items.'
      );
    }
    const url =
      `https://api.apify.com/v2/datasets/${datasetId}/items` +
      `?clean=true&format=json&token=${token}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Apify dataset fetch failed (${res.status} ${res.statusText}).`
      );
    }
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as ApifyPostItem[]) : [];
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
   * fields it cannot determine. A valid session needs a start time OR a venue.
   */
  private isValidSession(extracted: ExtractedSessionDto): boolean {
    const hasTime = !!extracted.startTime;
    const hasVenue = !!(
      extracted.venue?.name ||
      extracted.venue?.address ||
      extracted.location
    );
    return hasTime || hasVenue;
  }
}
