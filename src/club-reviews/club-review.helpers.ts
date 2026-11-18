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

/**
 * Club reviews are anonymous to readers. The club is small and the host
 * often knows every member, so a named review is a review the author
 * cannot afford to write honestly; the host-rating flow
 * (`RatingsService.anonymizeRater`) follows the same rule. The author's id
 * stays in the table so admins can moderate and the author can edit.
 */
export const ANONYMOUS_REVIEWER = {
  id: 'anonymous',
  name: null,
  image: null,
} as const;

/**
 * The public list stays hidden until the club has this many VISIBLE
 * reviews: with one or two, the host can often tell who wrote it.
 */
export const MIN_REVIEWS_TO_LIST = 3;

/**
 * Mid-month noon UTC: the exact day and hour would tell the host which
 * session the author just came back from, and mid-month at noon reads as
 * the same month in every timezone.
 */
function coarsenToMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 15, 12));
}

interface ClubReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The only shape a club review leaves the public API in: no `userId`, no
 * author profile, month-level dates. `isEdited` is computed here because
 * coarse dates can no longer show it.
 */
export function toAnonymousClubReview(review: ClubReviewRow) {
  const month = coarsenToMonth(review.createdAt);
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: month,
    updatedAt: month,
    isEdited:
      review.updatedAt.getTime() - review.createdAt.getTime() > 60 * 1000,
    isAnonymous: true,
    user: ANONYMOUS_REVIEWER,
  };
}

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
