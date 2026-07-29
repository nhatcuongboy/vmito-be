import { SportType } from '@prisma/client';
import { removeVietnameseTones } from '../common/utils/string.utils';

/**
 * Per-sport display/search prefixes. Raw venue names don't include the
 * sport prefix ("Nhật Cường" not "Sân cầu lông Nhật Cường"), so it is
 * prepended when generating slugs and searchTerms.
 * - label: Vietnamese display prefix (used for slugs)
 * - search: normalized (tone-less, lowercase) tokens for searchTerms
 */
export const SPORT_PREFIX: Record<
  SportType,
  { label: string; search: string }
> = {
  [SportType.BADMINTON]: { label: 'Sân cầu lông', search: 'san cau long' },
  [SportType.PICKLEBALL]: {
    label: 'Sân pickleball',
    search: 'san pickleball',
  },
};

export interface VenueSearchTermsInput {
  name: string;
  sportType?: SportType | null;
  address?: string | null;
  district?: string | null;
  city?: string | null;
  newAddress?: string | null;
  newDistrict?: string | null;
  newCity?: string | null;
}

/**
 * Build the normalized searchTerms string for a venue. Includes the
 * sport prefix tokens (e.g. "san cau long") so keyword searches like
 * "Sân cầu lông Nhật Cường" or "Sân Nhật Cường" match venues whose
 * stored name is just "Nhật Cường".
 *
 * Lives here rather than on VenuesService so the address-migration service can
 * recompute searchTerms after rewriting a venue's new-era address without
 * depending on VenuesService (which would be a circular dependency).
 */
export function buildVenueSearchTerms(venue: VenueSearchTermsInput): string {
  const prefix = SPORT_PREFIX[venue.sportType ?? SportType.BADMINTON].search;
  return removeVietnameseTones(
    [
      prefix,
      venue.name,
      venue.address,
      venue.district,
      venue.city,
      venue.newAddress,
      venue.newDistrict,
      venue.newCity,
    ]
      .filter(Boolean)
      .join(' ')
  ).toLowerCase();
}
