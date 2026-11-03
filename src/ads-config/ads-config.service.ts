import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Screens the mobile app may place a native ad on. */
export const AD_PLACEMENTS = ['home', 'feed', 'news'] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export interface AdsConfigResponse {
  enabled: boolean;
  placements: AdPlacement[];
  /** One ad after every N items in a feed-style list. */
  feedInterval: number;
}

const DEFAULT_FEED_INTERVAL = 8;
const MIN_FEED_INTERVAL = 4;

/**
 * Remote switch for in-app ads, read from env so turning ads off is a config
 * change and a restart, not an app release. Unset means off: a freshly
 * deployed backend never starts showing ads on its own.
 */
@Injectable()
export class AdsConfigService {
  private readonly config: AdsConfigResponse;

  constructor(configService: ConfigService) {
    const enabled =
      configService.get<string>('ADS_ENABLED')?.trim().toLowerCase() ===
      'true';
    const rawPlacements = configService.get<string>('ADS_PLACEMENTS');
    const placements = rawPlacements
      ? rawPlacements
          .split(',')
          .map((p) => p.trim())
          .filter((p): p is AdPlacement =>
            (AD_PLACEMENTS as readonly string[]).includes(p),
          )
      : [...AD_PLACEMENTS];
    const interval = Number(configService.get<string>('ADS_FEED_INTERVAL'));
    this.config = {
      enabled,
      placements,
      feedInterval: Number.isInteger(interval)
        ? Math.max(interval, MIN_FEED_INTERVAL)
        : DEFAULT_FEED_INTERVAL,
    };
  }

  get(): AdsConfigResponse {
    return this.config;
  }
}
