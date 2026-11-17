import { Injectable, NotFoundException } from '@nestjs/common';
import { ClubReviewStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPagination,
  resolvePaging,
} from '../venue-reviews/venue-review.helpers';
import { AdminClubReviewsQueryDto } from './dto/club-review.dto';
import {
  ADMIN_CLUB_REVIEW_INCLUDE,
  refreshClubAggregate,
} from './club-review.helpers';

@Injectable()
export class ClubReviewsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminClubReviewsQueryDto) {
    const paging = resolvePaging(query.page, query.limit);
    const where: Prisma.ClubReviewWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.clubId ? { clubId: query.clubId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.clubReview.findMany({
        where,
        include: ADMIN_CLUB_REVIEW_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.limit,
      }),
      this.prisma.clubReview.count({ where }),
    ]);

    return {
      data,
      pagination: buildPagination(paging.page, paging.limit, total),
    };
  }

  async setStatus(reviewId: string, status: ClubReviewStatus) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.clubReview.findUnique({
        where: { id: reviewId },
        select: { clubId: true },
      });
      if (!existing) throw new NotFoundException('Review not found');

      const review = await tx.clubReview.update({
        where: { id: reviewId },
        data: { status },
        include: ADMIN_CLUB_REVIEW_INCLUDE,
      });
      await refreshClubAggregate(tx, existing.clubId);
      return review;
    });
  }

  async remove(reviewId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.clubReview.findUnique({
        where: { id: reviewId },
        select: { clubId: true },
      });
      if (!existing) throw new NotFoundException('Review not found');

      await tx.clubReview.delete({ where: { id: reviewId } });
      await refreshClubAggregate(tx, existing.clubId);
      return { id: reviewId };
    });
  }
}
