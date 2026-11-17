import { Prisma, VenueReviewStatus } from '@prisma/client';

export const DEFAULT_PAGE_SIZE = 10;

export const REVIEW_INCLUDE = {
  user: { select: { id: true, name: true, image: true } },
} satisfies Prisma.VenueReviewInclude;

export const ADMIN_REVIEW_INCLUDE = {
  ...REVIEW_INCLUDE,
  venue: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.VenueReviewInclude;

export interface IVenueReviewSummary {
  averageRating: number | null;
  reviewCount: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

type ReviewClient = Pick<Prisma.TransactionClient, 'venueReview'>;

/** Aggregate over VISIBLE reviews only, always recomputed from the DB. */
export async function computeVenueReviewSummary(
  client: ReviewClient,
  venueId: string
): Promise<IVenueReviewSummary> {
  const groups = await client.venueReview.groupBy({
    by: ['rating'],
    where: { venueId, status: VenueReviewStatus.VISIBLE },
    _count: { _all: true },
  });

  const distribution: IVenueReviewSummary['distribution'] = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  let total = 0;
  let sum = 0;
  for (const group of groups) {
    if (group.rating < 1 || group.rating > 5) continue;
    distribution[group.rating as keyof typeof distribution] = group._count._all;
    total += group._count._all;
    sum += group.rating * group._count._all;
  }

  return {
    averageRating: total > 0 ? Math.round((sum / total) * 100) / 100 : null,
    reviewCount: total,
    distribution,
  };
}

/**
 * Recomputes the summary and writes it to the denormalised venue columns.
 * Call inside the same transaction as the review write.
 */
export async function refreshVenueAggregate(
  tx: Prisma.TransactionClient,
  venueId: string
): Promise<IVenueReviewSummary> {
  const summary = await computeVenueReviewSummary(tx, venueId);
  await tx.venue.update({
    where: { id: venueId },
    data: {
      averageRating: summary.averageRating,
      reviewCount: summary.reviewCount,
    },
  });
  return summary;
}

export function resolvePaging(page?: number, limit?: number) {
  const safePage = page && page > 0 ? page : 1;
  const safeLimit = limit && limit > 0 ? limit : DEFAULT_PAGE_SIZE;
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

export function buildPagination(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
