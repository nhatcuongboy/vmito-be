import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ClubReviewStatus, MemberStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ClubReviewsAdminService } from './club-reviews-admin.service';
import { ClubReviewsService } from './club-reviews.service';

interface IStoredReview {
  id: string;
  clubId: string;
  userId: string;
  rating: number;
  comment: string | null;
  status: ClubReviewStatus;
  createdAt: Date;
}

type Where = Record<string, unknown>;

/** Minimal in-memory Prisma fake so aggregate assertions run the real recompute. */
function createFakePrisma() {
  const reviews: IStoredReview[] = [];
  const club = {
    id: 'club-1',
    slug: 'clb-a',
    hostId: 'host-1',
    status: 'APPROVED',
    isPublic: true,
    averageRating: null as number | null,
    reviewCount: 0,
  };
  const members = new Map<string, MemberStatus>();
  let seq = 0;
  const self: { current: unknown } = { current: null };

  const matches = (r: IStoredReview, where: Where = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'clubId_userId') {
        const c = v as { clubId: string; userId: string };
        return r.clubId === c.clubId && r.userId === c.userId;
      }
      return (r as unknown as Where)[k] === v;
    });
  const withUser = (r: IStoredReview) => ({
    ...r,
    user: { id: r.userId, name: r.userId, image: null },
  });

  const prisma = {
    club: {
      findFirst: jest.fn(({ where }: { where: Where }) => {
        const keys = where.OR as { id?: string; slug?: string }[];
        const hit = keys.some((c) => c.id === club.id || c.slug === club.slug);
        const ok =
          hit &&
          (where.status === undefined || where.status === club.status) &&
          (where.isPublic === undefined || where.isPublic === club.isPublic);
        return Promise.resolve(
          ok ? { id: club.id, hostId: club.hostId } : null
        );
      }),
      update: jest.fn(({ data }: { data: Partial<typeof club> }) => {
        Object.assign(club, data);
        return Promise.resolve(club);
      }),
    },
    clubMember: {
      findUnique: jest.fn(
        ({ where }: { where: { clubId_userId: { userId: string } } }) => {
          const status = members.get(where.clubId_userId.userId);
          return Promise.resolve(status ? { status } : null);
        }
      ),
    },
    clubReview: {
      findUnique: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(reviews.find((r) => matches(r, where)) ?? null)
      ),
      findFirst: jest.fn(({ where }: { where: Where }) => {
        const found = reviews.find((r) => matches(r, where));
        return Promise.resolve(found ? withUser(found) : null);
      }),
      findMany: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(
          reviews
            .filter((r) => matches(r, where))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map(withUser)
        )
      ),
      count: jest.fn(({ where }: { where: Where }) =>
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
            status: ClubReviewStatus.VISIBLE,
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
      groupBy: jest.fn(({ where }: { where: Where }) => {
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
  return { prisma, club, members, reviews };
}

const user = (id: string, role = 'PLAYER'): AuthenticatedUser => ({
  userId: id,
  email: `${id}@x.com`,
  name: id,
  role,
});

describe('ClubReviewsService (member-only)', () => {
  let ctx: ReturnType<typeof createFakePrisma>;
  let service: ClubReviewsService;
  let admin: ClubReviewsAdminService;

  beforeEach(() => {
    ctx = createFakePrisma();
    ctx.members.set('u1', MemberStatus.ACTIVE);
    ctx.members.set('u2', MemberStatus.ACTIVE);
    ctx.members.set('pending', MemberStatus.PENDING);
    ctx.members.set('suspended', MemberStatus.SUSPENDED);
    ctx.members.set('host-1', MemberStatus.ACTIVE);
    service = new ClubReviewsService(ctx.prisma as never);
    admin = new ClubReviewsAdminService(ctx.prisma as never);
  });

  it('lets an active member review and updates the aggregate (by id or slug)', async () => {
    const result = await service.create(
      'clb-a',
      { rating: 4, comment: 'ok' },
      user('u1')
    );
    expect(result.summary).toEqual({
      averageRating: 4,
      reviewCount: 1,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 },
    });
    expect(ctx.club).toMatchObject({ averageRating: 4, reviewCount: 1 });
  });

  it.each(['outsider', 'pending', 'suspended'])(
    'rejects non-active member %s with 403',
    async (id) => {
      await expect(
        service.create('club-1', { rating: 5 }, user(id))
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ctx.reviews).toHaveLength(0);
    }
  );

  it('rejects the host even if they are also a member', async () => {
    await expect(
      service.create('club-1', { rating: 5 }, user('host-1'))
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reports eligibility for member / outsider / host', async () => {
    await expect(service.getEligibility('club-1', 'u1')).resolves.toEqual({
      canReview: true,
    });
    await expect(service.getEligibility('club-1', 'outsider')).resolves.toEqual(
      { canReview: false }
    );
    await expect(service.getEligibility('club-1', 'host-1')).resolves.toEqual({
      canReview: false,
    });
  });

  it('404s for unknown, private or unapproved clubs', async () => {
    await expect(service.list('nope')).rejects.toBeInstanceOf(
      NotFoundException
    );
    ctx.club.isPublic = false;
    await expect(service.list('club-1')).rejects.toBeInstanceOf(
      NotFoundException
    );
    ctx.club.isPublic = true;
    ctx.club.status = 'PENDING';
    await expect(
      service.create('club-1', { rating: 5 }, user('u1'))
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a second review with 409, including the unique-constraint race', async () => {
    await service.create('club-1', { rating: 5 }, user('u1'));
    await expect(
      service.create('club-1', { rating: 3 }, user('u1'))
    ).rejects.toBeInstanceOf(ConflictException);

    ctx.prisma.clubReview.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      })
    );
    await expect(
      service.create('club-1', { rating: 5 }, user('u2'))
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('recomputes on update (omitted comment clears it); a former member can still edit', async () => {
    const { review } = await service.create(
      'club-1',
      { rating: 5, comment: 'x' },
      user('u1')
    );
    await service.create('club-1', { rating: 3 }, user('u2'));
    ctx.members.delete('u1');

    const updated = await service.update(
      'club-1',
      review.id,
      { rating: 1 },
      user('u1')
    );
    expect(updated.review.comment).toBeNull();
    expect(updated.summary.averageRating).toBe(2);
    expect(ctx.club.averageRating).toBe(2);
  });

  it("blocks editing or deleting someone else's review", async () => {
    const { review } = await service.create(
      'club-1',
      { rating: 5 },
      user('u1')
    );
    await expect(
      service.update('club-1', review.id, { rating: 1 }, user('u2'))
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.remove('club-1', review.id, user('u2'))
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ctx.reviews).toHaveLength(1);
  });

  it('lets the owner and an ADMIN delete; aggregate resets', async () => {
    const a = await service.create('club-1', { rating: 5 }, user('u1'));
    const b = await service.create('club-1', { rating: 3 }, user('u2'));
    const afterOwner = await service.remove('club-1', a.review.id, user('u1'));
    expect(afterOwner.review).toBeNull();
    expect(afterOwner.summary.reviewCount).toBe(1);
    const afterAdmin = await service.remove(
      'club-1',
      b.review.id,
      user('adm', 'ADMIN')
    );
    expect(afterAdmin.summary.averageRating).toBeNull();
    expect(ctx.club).toMatchObject({ averageRating: null, reviewCount: 0 });
  });

  it('hides HIDDEN reviews from list, /me and the aggregate; shows them again', async () => {
    const a = await service.create('club-1', { rating: 5 }, user('u1'));
    await service.create('club-1', { rating: 1 }, user('u2'));

    await admin.setStatus(a.review.id, ClubReviewStatus.HIDDEN);
    expect(ctx.club).toMatchObject({ averageRating: 1, reviewCount: 1 });
    const page = await service.list('club-1');
    expect(page.data.map((r) => r.userId)).toEqual(['u2']);
    expect(page.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    await expect(service.findMine('club-1', 'u1')).resolves.toBeNull();

    await admin.setStatus(a.review.id, ClubReviewStatus.VISIBLE);
    expect(ctx.club).toMatchObject({ averageRating: 3, reviewCount: 2 });
    expect((await service.list('club-1')).data).toHaveLength(2);
  });

  it('admin delete recomputes and 404s for unknown ids', async () => {
    const a = await service.create('club-1', { rating: 4 }, user('u1'));
    await admin.remove(a.review.id);
    expect(ctx.club).toMatchObject({ averageRating: null, reviewCount: 0 });
    await expect(admin.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(
      admin.setStatus('missing', ClubReviewStatus.HIDDEN)
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
