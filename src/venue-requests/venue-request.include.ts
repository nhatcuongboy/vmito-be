import { Prisma } from '@prisma/client';

export const VENUE_REQUEST_INCLUDE = {
  submittedBy: {
    select: { id: true, name: true, email: true, image: true, phone: true },
  },
  reviewedBy: { select: { id: true, name: true, email: true, image: true } },
  venue: true,
  appliedVenue: true,
} satisfies Prisma.VenueRequestInclude;

export type VenueRequestWithRelations = Prisma.VenueRequestGetPayload<{
  include: typeof VENUE_REQUEST_INCLUDE;
}>;
