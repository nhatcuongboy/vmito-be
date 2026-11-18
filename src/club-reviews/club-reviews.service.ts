import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClubReviewStatus,
  ClubStatus,
  MemberStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import {
  buildPagination,
  resolvePaging,
} from '../venue-reviews/venue-review.helpers';
import { SaveClubReviewDto } from './dto/club-review.dto';
import {
  MIN_REVIEWS_TO_LIST,
  computeClubReviewSummary,
  refreshClubAggregate,
  toAnonymousClubReview,
} from './club-review.helpers';

const ADMIN_ROLE = 'ADMIN';
const ALREADY_REVIEWED = 'You have already reviewed this club';

/**
 * Member-only club reviews. Reviews are exposed only for approved, public
 * clubs (private clubs hide their details too); an unknown, pending or
 * private club is a 404.
 */
@Injectable()
export class ClubReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Accepts a club id or slug, like `GET /clubs/:id/details`. */
  private async resolveClub(idOrSlug: string) {
    const club = await this.prisma.club.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        status: ClubStatus.APPROVED,
        isPublic: true,
      },
      select: { id: true, hostId: true },
    });
    if (!club) throw new NotFoundException('Club not found');
    return club;
  }

  async list(idOrSlug: string, page?: number, limit?: number) {
    const { id: clubId } = await this.resolveClub(idOrSlug);
    const paging = resolvePaging(page, limit);
    const where = { clubId, status: ClubReviewStatus.VISIBLE };

    const [data, total, summary] = await Promise.all([
      this.prisma.clubReview.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.limit,
      }),
      this.prisma.clubReview.count({ where }),
      computeClubReviewSummary(this.prisma, clubId),
    ]);

    // Below the threshold the list is withheld, but the summary still
    // counts them; the caller's own review comes from `GET .../me`.
    const isListHidden = total < MIN_REVIEWS_TO_LIST;
    return {
      data: isListHidden ? [] : data.map(toAnonymousClubReview),
      pagination: buildPagination(
        paging.page,
        paging.limit,
        isListHidden ? 0 : total
      ),
      summary,
    };
  }

  /** The caller's own review; `null` when none or when it was hidden. */
  async findMine(idOrSlug: string, userId: string) {
    const { id: clubId } = await this.resolveClub(idOrSlug);
    const review = await this.prisma.clubReview.findFirst({
      where: { clubId, userId, status: ClubReviewStatus.VISIBLE },
    });
    return review ? toAnonymousClubReview(review) : null;
  }

  /**
   * Whether the caller may write a review: an ACTIVE member who is not the
   * host. Lets the client show the form only to eligible users.
   */
  async getEligibility(idOrSlug: string, userId: string) {
    const club = await this.resolveClub(idOrSlug);
    return { canReview: await this.isEligibleReviewer(club, userId) };
  }

  private async isEligibleReviewer(
    club: { id: string; hostId: string },
    userId: string
  ) {
    if (club.hostId === userId) return false;
    const member = await this.prisma.clubMember.findUnique({
      where: { clubId_userId: { clubId: club.id, userId } },
      select: { status: true },
    });
    return member?.status === MemberStatus.ACTIVE;
  }

  async create(
    idOrSlug: string,
    dto: SaveClubReviewDto,
    user: AuthenticatedUser
  ) {
    const club = await this.resolveClub(idOrSlug);
    if (club.hostId === user.userId) {
      throw new ForbiddenException('Hosts cannot review their own club');
    }
    if (!(await this.isEligibleReviewer(club, user.userId))) {
      throw new ForbiddenException('Only club members can review this club');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.clubReview.findUnique({
          where: { clubId_userId: { clubId: club.id, userId: user.userId } },
          select: { id: true },
        });
        if (existing) throw new ConflictException(ALREADY_REVIEWED);

        const review = await tx.clubReview.create({
          data: {
            clubId: club.id,
            userId: user.userId,
            rating: dto.rating,
            comment: dto.comment ?? null,
          },
        });
        const summary = await refreshClubAggregate(tx, club.id);
        return { review: toAnonymousClubReview(review), summary };
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

  /**
   * PUT-like: an omitted `comment` clears the stored comment. Membership is
   * not re-checked, so someone who left can still correct their review.
   */
  async update(
    idOrSlug: string,
    reviewId: string,
    dto: SaveClubReviewDto,
    user: AuthenticatedUser
  ) {
    const { id: clubId } = await this.resolveClub(idOrSlug);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.clubReview.findFirst({
        where: { id: reviewId, clubId },
        select: { id: true, userId: true },
      });
      if (!existing) throw new NotFoundException('Review not found');
      if (existing.userId !== user.userId) {
        throw new ForbiddenException('You can only edit your own review');
      }

      const review = await tx.clubReview.update({
        where: { id: reviewId },
        data: { rating: dto.rating, comment: dto.comment ?? null },
      });
      const summary = await refreshClubAggregate(tx, clubId);
      return { review: toAnonymousClubReview(review), summary };
    });
  }

  async remove(idOrSlug: string, reviewId: string, user: AuthenticatedUser) {
    const { id: clubId } = await this.resolveClub(idOrSlug);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.clubReview.findFirst({
        where: { id: reviewId, clubId },
        select: { id: true, userId: true },
      });
      if (!existing) throw new NotFoundException('Review not found');
      if (existing.userId !== user.userId && user.role !== ADMIN_ROLE) {
        throw new ForbiddenException('You can only delete your own review');
      }

      await tx.clubReview.delete({ where: { id: reviewId } });
      const summary = await refreshClubAggregate(tx, clubId);
      return { review: null, summary };
    });
  }
}
