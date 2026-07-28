import { ExtractedSessionDto } from '../../ai/dto/extract-session.dto';

/**
 * Location columns written by the crawler ingest. Exactly one of the two
 * shapes is ever produced:
 *
 * - venueId set, every customLocation* null — the AI matched a Venue that we
 *   re-verified still exists in the database.
 * - venueId undefined, customLocation* filled — the AI could not be matched to
 *   a Venue, so its unverified text is kept as a custom-location snapshot.
 *
 * placeId/lat/lng are always null: this ingest does not geocode, and an
 * un-geocoded snapshot must not masquerade as a verified map location.
 */
export type CrawledSessionLocation = {
  venueId?: string;
  location?: string;
  customLocationName: string | null;
  customLocationAddress: string | null;
  customLocationPlaceId: null;
  customLocationLat: null;
  customLocationLng: null;
  customLocationDistrict: string | null;
  customLocationCity: string | null;
  /** Extra tokens to fold into Session.searchTerms. */
  searchTerms: string[];
};

const clean = (value?: string | null): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Resolve the location columns for a crawled session.
 *
 * @param extracted AI extraction result (its venueId is only a hint).
 * @param verifiedVenue The Venue row re-fetched by the caller, or null when the
 * id was absent or no longer resolves. Passing null is what makes a dangling
 * venue id degrade into a custom location instead of a foreign-key error.
 */
export function resolveCrawledSessionLocation(
  extracted: ExtractedSessionDto,
  verifiedVenue: { id: string; name: string } | null
): CrawledSessionLocation {
  const venue = extracted.venue;
  const aiLocation = clean(extracted.location);

  if (verifiedVenue) {
    // Prefer the AI's display string; otherwise compose "<venue>, <address>"
    // so the court name is never dropped from the card.
    const composed = [clean(venue?.name), clean(venue?.address)]
      .filter(Boolean)
      .join(', ');
    return {
      venueId: verifiedVenue.id,
      location: aiLocation || composed || undefined,
      customLocationName: null,
      customLocationAddress: null,
      customLocationPlaceId: null,
      customLocationLat: null,
      customLocationLng: null,
      customLocationDistrict: null,
      customLocationCity: null,
      searchTerms: [verifiedVenue.name],
    };
  }

  // Same fallback order as the frontend resolver so a post imported by the
  // crawler and the same post pasted into the create form land on identical
  // custom-location fields.
  const name = clean(venue?.name) || aiLocation || clean(venue?.address);
  const address = clean(venue?.address);
  const district = clean(venue?.newDistrict) || clean(venue?.district) || null;
  const city = clean(venue?.newCity) || clean(venue?.city) || null;

  return {
    venueId: undefined,
    // location mirrors customLocationName so older readers that only know the
    // legacy free-form column keep rendering something sensible.
    location: name,
    customLocationName: name ?? null,
    // Repeating the name as the address adds nothing and reads as duplicated
    // text in the UI.
    customLocationAddress: address && address !== name ? address : null,
    customLocationPlaceId: null,
    customLocationLat: null,
    customLocationLng: null,
    customLocationDistrict: district,
    customLocationCity: city,
    searchTerms: [name, address, district, city].filter(
      (part): part is string => Boolean(part)
    ),
  };
}
