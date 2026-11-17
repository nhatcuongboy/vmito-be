import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VenueReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ADMIN_REVIEW_INCLUDE,
  buildPagination,
  refreshVenueAggregate,
  resolvePaging,
} from './venue-review.helpers';
import { AdminVenueReviewsQueryDto } from './dto/venue-review-query.dto';

@Injectable()
export class VenueReviewsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminVenueReviewsQueryDto) {
    const paging = resolvePaging(query.page, query.limit);
    const where: Prisma.VenueReviewWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.venueId ? { venueId: query.venueId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.venueReview.findMany({
        where,
        include: ADMIN_REVIEW_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.limit,
      }),
      this.prisma.venueReview.count({ where }),
    ]);

    return {
      data,
      pagination: buildPagination(paging.page, paging.limit, total),
    };
  }

  async setStatus(reviewId: string, status: VenueReviewStatus) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.venueReview.findUnique({
        where: { id: reviewId },
        select: { venueId: true },
      });
      if (!existing) throw new NotFoundException('Review not found');

      const review = await tx.venueReview.update({
        where: { id: reviewId },
        data: { status },
        include: ADMIN_REVIEW_INCLUDE,
      });
      await refreshVenueAggregate(tx, existing.venueId);
      return review;
    });
  }

  async remove(reviewId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.venueReview.findUnique({
        where: { id: reviewId },
        select: { venueId: true },
      });
      if (!existing) throw new NotFoundException('Review not found');

      await tx.venueReview.delete({ where: { id: reviewId } });
      await refreshVenueAggregate(tx, existing.venueId);
      return { id: reviewId };
    });
  }
}
