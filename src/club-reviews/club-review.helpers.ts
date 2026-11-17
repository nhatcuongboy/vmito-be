import { ClubReviewStatus, Prisma } from '@prisma/client';
import {
  IVenueReviewSummary,
  summarizeRatingGroups,
} from '../venue-reviews/venue-review.helpers';

export const CLUB_REVIEW_INCLUDE = {
  user: { select: { id: true, name: true, image: true } },
} satisfies Prisma.ClubReviewInclude;

export const ADMIN_CLUB_REVIEW_INCLUDE = {
  ...CLUB_REVIEW_INCLUDE,
  club: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ClubReviewInclude;

type ClubReviewClient = Pick<Prisma.TransactionClient, 'clubReview'>;

/** Aggregate over VISIBLE reviews only, always recomputed from the DB. */
export async function computeClubReviewSummary(
  client: ClubReviewClient,
  clubId: string
): Promise<IVenueReviewSummary> {
  const groups = await client.clubReview.groupBy({
    by: ['rating'],
    where: { clubId, status: ClubReviewStatus.VISIBLE },
    _count: { _all: true },
  });
  return summarizeRatingGroups(groups);
}

/** Writes the recomputed summary to the club row; call inside the review's transaction. */
export async function refreshClubAggregate(
  tx: Prisma.TransactionClient,
  clubId: string
): Promise<IVenueReviewSummary> {
  const summary = await computeClubReviewSummary(tx, clubId);
  await tx.club.update({
    where: { id: clubId },
    data: {
      averageRating: summary.averageRating,
      reviewCount: summary.reviewCount,
    },
  });
  return summary;
}
