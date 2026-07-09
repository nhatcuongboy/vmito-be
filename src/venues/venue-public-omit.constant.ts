import { Prisma } from '@prisma/client';

/**
 * Fields to hide from bulk/public venue listings (search, findAll) and from
 * nested `venue` includes on other public endpoints (session/tournament
 * detail). Excludes credentials (wifi) and internal-only fields never read
 * by list/card UI — kept separate from `findOne`, which still needs these
 * for the public venue detail page and the admin edit form.
 *
 * Lives in its own file (rather than venues.service.ts) so it can be
 * imported by other services without creating a circular import back into
 * VenuesService.
 */
export const VENUE_PUBLIC_OMIT = {
  wifiName: true,
  wifiPassword: true,
  searchTerms: true,
  imagePublicIds: true,
  coverPhotoPublicId: true,
  courtLayoutImagePublicId: true,
  bookingPolicy: true,
  locatedWithin: true,
} satisfies Prisma.VenueOmit;
