import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VenueReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { SaveVenueReviewDto } from './dto/save-venue-review.dto';
import {
  buildPagination,
  computeVenueReviewSummary,
  refreshVenueAggregate,
  resolvePaging,
  REVIEW_INCLUDE,
} from './venue-review.helpers';

const GUEST_ROLE = 'GUEST';
const ADMIN_ROLE = 'ADMIN';
const ALREADY_REVIEWED = 'You have already reviewed this venue';

@Injectable()
export class VenueReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Accepts a venue id or slug, like `GET /venues/:id`. */
  private async resolveVenueId(idOrSlug: string): Promise<string> {
    const venue = await this.prisma.venue.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true },
    });
    if (!venue) throw new NotFoundException('Venue not found');
    return venue.id;
  }

  async list(idOrSlug: string, page?: number, limit?: number) {
    const venueId = await this.resolveVenueId(idOrSlug);
    const paging = resolvePaging(page, limit);
    const where = { venueId, status: VenueReviewStatus.VISIBLE };

    const [data, total, summary] = await Promise.all([
      this.prisma.venueReview.findMany({
        where,
        include: REVIEW_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.limit,
      }),
      this.prisma.venueReview.count({ where }),
      computeVenueReviewSummary(this.prisma, venueId),
    ]);

    return {
      data,
      pagination: buildPagination(paging.page, paging.limit, total),
      summary,
    };
  }

  /** The caller's own review; `null` when none or when it was hidden. */
  async findMine(idOrSlug: string, userId: string) {
    const venueId = await this.resolveVenueId(idOrSlug);
    return this.prisma.venueReview.findFirst({
      where: { venueId, userId, status: VenueReviewStatus.VISIBLE },
      include: REVIEW_INCLUDE,
    });
  }

  async create(
    idOrSlug: string,
    dto: SaveVenueReviewDto,
    user: AuthenticatedUser
  ) {
    if (user.role === GUEST_ROLE) {
      throw new ForbiddenException('Guests cannot review venues');
    }
    const venueId = await this.resolveVenueId(idOrSlug);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.venueReview.findUnique({
          where: { venueId_userId: { venueId, userId: user.userId } },
          select: { id: true },
        });
        if (existing) throw new ConflictException(ALREADY_REVIEWED);

        const review = await tx.venueReview.create({
          data: {
            venueId,
            userId: user.userId,
            rating: dto.rating,
            comment: dto.comment ?? null,
          },
          include: REVIEW_INCLUDE,
        });
        const summary = await refreshVenueAggregate(tx, venueId);
        return { review, summary };
      });
    } catch (error) {
      // Two concurrent submits can both pass the findUnique check.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(ALREADY_REVIEWED);
      }
      throw error;
    }
  }

  /** PUT-like: an omitted `comment` clears the stored comment. */
  async update(
    idOrSlug: string,
    reviewId: string,
    dto: SaveVenueReviewDto,
    user: AuthenticatedUser
  ) {
    const venueId = await this.resolveVenueId(idOrSlug);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.venueReview.findFirst({
        where: { id: reviewId, venueId },
        select: { id: true, userId: true },
      });
      if (!existing) throw new NotFoundException('Review not found');
      if (existing.userId !== user.userId) {
        throw new ForbiddenException('You can only edit your own review');
      }

      const review = await tx.venueReview.update({
        where: { id: reviewId },
        data: { rating: dto.rating, comment: dto.comment ?? null },
        include: REVIEW_INCLUDE,
      });
      const summary = await refreshVenueAggregate(tx, venueId);
      return { review, summary };
    });
  }

  async remove(idOrSlug: string, reviewId: string, user: AuthenticatedUser) {
    const venueId = await this.resolveVenueId(idOrSlug);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.venueReview.findFirst({
        where: { id: reviewId, venueId },
        select: { id: true, userId: true },
      });
      if (!existing) throw new NotFoundException('Review not found');
      if (existing.userId !== user.userId && user.role !== ADMIN_ROLE) {
        throw new ForbiddenException('You can only delete your own review');
      }

      await tx.venueReview.delete({ where: { id: reviewId } });
      const summary = await refreshVenueAggregate(tx, venueId);
      return { review: null, summary };
    });
  }
}
