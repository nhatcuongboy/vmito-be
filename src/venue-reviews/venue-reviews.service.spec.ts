import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VenueReviewStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { VenueReviewsAdminService } from './venue-reviews-admin.service';
import { VenueReviewsService } from './venue-reviews.service';

interface IStoredReview {
  id: string;
  venueId: string;
  userId: string;
  rating: number;
  comment: string | null;
  status: VenueReviewStatus;
  createdAt: Date;
}

/**
 * Minimal in-memory Prisma fake: just enough of `venueReview` / `venue` for
 * the service to run, so aggregate assertions exercise the real recompute.
 */
function createFakePrisma() {
  const reviews: IStoredReview[] = [];
  const venue = {
    id: 'venue-1',
    slug: 'san-a',
    averageRating: null as number | null,
    reviewCount: 0,
  };
  let seq = 0;
  const self: { current: unknown } = { current: null };

  const matches = (r: IStoredReview, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'venueId_userId') {
        const c = v as { venueId: string; userId: string };
        return r.venueId === c.venueId && r.userId === c.userId;
      }
      return (r as unknown as Record<string, unknown>)[k] === v;
    });
  const withUser = (r: IStoredReview) => ({
    ...r,
    user: { id: r.userId, name: r.userId, image: null },
  });

  const prisma = {
    venue: {
      findFirst: jest.fn(
        ({ where }: { where: { OR: { id?: string; slug?: string }[] } }) =>
          Promise.resolve(
            where.OR.some((c) => c.id === venue.id || c.slug === venue.slug)
              ? { id: venue.id }
              : null
          )
      ),
      update: jest.fn(({ data }: { data: Partial<typeof venue> }) => {
        Object.assign(venue, data);
        return Promise.resolve(venue);
      }),
    },
    venueReview: {
      findUnique: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(reviews.find((r) => matches(r, where)) ?? null)
      ),
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          (() => {
            const found = reviews.find((r) => matches(r, where));
            return found ? withUser(found) : null;
          })()
        )
      ),
      findMany: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          reviews
            .filter((r) => matches(r, where))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map(withUser)
        )
      ),
      count: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(reviews.filter((r) => matches(r, where)).length)
      ),
      create: jest.fn(
        ({
          data,
        }: {
          data: Omit<IStoredReview, 'id' | 'status' | 'createdAt'>;
        }) => {
          const review: IStoredReview = {
            ...data,
            id: `r${++seq}`,
            status: VenueReviewStatus.VISIBLE,
            createdAt: new Date(2026, 0, seq),
          };
          reviews.push(review);
          return Promise.resolve(withUser(review));
        }
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<IStoredReview>;
        }) => {
          const review = reviews.find((r) => r.id === where.id)!;
          Object.assign(review, data);
          return Promise.resolve(withUser(review));
        }
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        reviews.splice(
          reviews.findIndex((r) => r.id === where.id),
          1
        );
        return Promise.resolve();
      }),
      groupBy: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        const counts = new Map<number, number>();
        reviews
          .filter((r) => matches(r, where))
          .forEach((r) =>
            counts.set(r.rating, (counts.get(r.rating) ?? 0) + 1)
          );
        return Promise.resolve(
          [...counts].map(([rating, n]) => ({ rating, _count: { _all: n } }))
        );
      }),
    },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(self.current)),
  };
  self.current = prisma;
  return { prisma, venue, reviews };
}

const user = (id: string, role = 'PLAYER'): AuthenticatedUser => ({
  userId: id,
  email: `${id}@x.com`,
  name: id,
  role,
});

describe('VenueReviewsService', () => {
  let ctx: ReturnType<typeof createFakePrisma>;
  let service: VenueReviewsService;
  let admin: VenueReviewsAdminService;

  beforeEach(() => {
    ctx = createFakePrisma();
    service = new VenueReviewsService(ctx.prisma as never);
    admin = new VenueReviewsAdminService(ctx.prisma as never);
  });

  it('creates a review and updates the summary and venue aggregate', async () => {
    const result = await service.create(
      'venue-1',
      { rating: 4, comment: 'ok' },
      user('u1')
    );
    expect(result.review.rating).toBe(4);
    expect(result.summary).toEqual({
      averageRating: 4,
      reviewCount: 1,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 },
    });
    expect(ctx.venue).toMatchObject({ averageRating: 4, reviewCount: 1 });
  });

  it('accepts a venue slug', async () => {
    await expect(
      service.create('san-a', { rating: 5 }, user('u1'))
    ).resolves.toBeDefined();
  });

  it('404s for an unknown venue', async () => {
    await expect(
      service.create('nope', { rating: 5 }, user('u1'))
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects GUEST users with 403', async () => {
    await expect(
      service.create('venue-1', { rating: 5 }, user('g1', 'GUEST'))
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ctx.reviews).toHaveLength(0);
  });

  it('rejects a second review by the same user with 409', async () => {
    await service.create('venue-1', { rating: 5 }, user('u1'));
    await expect(
      service.create('venue-1', { rating: 3 }, user('u1'))
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a unique-constraint race to 409', async () => {
    ctx.prisma.venueReview.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      })
    );
    await expect(
      service.create('venue-1', { rating: 5 }, user('u1'))
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('recomputes the aggregate on update and clears an omitted comment', async () => {
    const { review } = await service.create(
      'venue-1',
      { rating: 5, comment: 'x' },
      user('u1')
    );
    await service.create('venue-1', { rating: 3 }, user('u2'));

    const updated = await service.update(
      'venue-1',
      review.id,
      { rating: 1 },
      user('u1')
    );
    expect(updated.review.comment).toBeNull();
    expect(updated.summary.averageRating).toBe(2);
    expect(updated.summary.distribution).toEqual({
      1: 1,
      2: 0,
      3: 1,
      4: 0,
      5: 0,
    });
    expect(ctx.venue.averageRating).toBe(2);
  });

  it("blocks editing or deleting someone else's review", async () => {
    const { review } = await service.create(
      'venue-1',
      { rating: 5 },
      user('u1')
    );
    await expect(
      service.update('venue-1', review.id, { rating: 1 }, user('u2'))
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.remove('venue-1', review.id, user('u2'))
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ctx.reviews).toHaveLength(1);
  });

  it('404s when the review belongs to another venue', async () => {
    const { review } = await service.create(
      'venue-1',
      { rating: 5 },
      user('u1')
    );
    ctx.prisma.venue.findFirst.mockResolvedValueOnce({ id: 'venue-2' });
    await expect(
      service.update('venue-2', review.id, { rating: 1 }, user('u1'))
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets the owner and an ADMIN delete; aggregate resets', async () => {
    const a = await service.create('venue-1', { rating: 5 }, user('u1'));
    const b = await service.create('venue-1', { rating: 3 }, user('u2'));

    const afterOwner = await service.remove('venue-1', a.review.id, user('u1'));
    expect(afterOwner.review).toBeNull();
    expect(afterOwner.summary.reviewCount).toBe(1);

    const afterAdmin = await service.remove(
      'venue-1',
      b.review.id,
      user('adm', 'ADMIN')
    );
    expect(afterAdmin.summary).toEqual({
      averageRating: null,
      reviewCount: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
    expect(ctx.venue).toMatchObject({ averageRating: null, reviewCount: 0 });
  });

  it('hides HIDDEN reviews from the public list, /me and the aggregate; shows them again', async () => {
    const a = await service.create('venue-1', { rating: 5 }, user('u1'));
    await service.create('venue-1', { rating: 1 }, user('u2'));

    const hidden = await admin.setStatus(a.review.id, VenueReviewStatus.HIDDEN);
    expect(hidden.status).toBe(VenueReviewStatus.HIDDEN);
    expect(ctx.venue).toMatchObject({ averageRating: 1, reviewCount: 1 });

    const page = await service.list('venue-1');
    expect(page.data.map((r) => r.userId)).toEqual(['u2']);
    expect(page.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    expect(page.summary.reviewCount).toBe(1);
    await expect(service.findMine('venue-1', 'u1')).resolves.toBeNull();

    await admin.setStatus(a.review.id, VenueReviewStatus.VISIBLE);
    expect(ctx.venue).toMatchObject({ averageRating: 3, reviewCount: 2 });
    expect((await service.list('venue-1')).data).toHaveLength(2);
    await expect(service.findMine('venue-1', 'u1')).resolves.toMatchObject({
      id: a.review.id,
    });
  });

  it('admin delete recomputes the aggregate and 404s for unknown ids', async () => {
    const a = await service.create('venue-1', { rating: 4 }, user('u1'));
    await admin.remove(a.review.id);
    expect(ctx.venue).toMatchObject({ averageRating: null, reviewCount: 0 });
    await expect(admin.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(
      admin.setStatus('missing', VenueReviewStatus.HIDDEN)
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
