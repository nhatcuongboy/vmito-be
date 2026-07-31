import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FavoriteType, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsGateway } from '../sessions/sessions.gateway';
import { FavoritesService } from './favorites.service';

describe('FavoritesService', () => {
  let service: FavoritesService;
  let prisma: {
    favorite: {
      create: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      count: jest.Mock;
    };
    session: { findFirst: jest.Mock; findMany: jest.Mock };
    venue: { findFirst: jest.Mock; findMany: jest.Mock };
    club: { findFirst: jest.Mock; findMany: jest.Mock };
    tournament: { findFirst: jest.Mock; findMany: jest.Mock };
    clubMember: { findFirst: jest.Mock };
    tournamentManager: { findUnique: jest.Mock };
    venueManager: { findUnique: jest.Mock };
    notification: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let notificationsService: { createForUser: jest.Mock };
  let sessionsGateway: { notifyFavoriteUpdate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      favorite: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
      },
      session: { findFirst: jest.fn(), findMany: jest.fn() },
      venue: { findFirst: jest.fn(), findMany: jest.fn() },
      club: { findFirst: jest.fn(), findMany: jest.fn() },
      tournament: { findFirst: jest.fn(), findMany: jest.fn() },
      clubMember: { findFirst: jest.fn() },
      tournamentManager: { findUnique: jest.fn() },
      venueManager: { findUnique: jest.fn() },
      notification: { findFirst: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    notificationsService = { createForUser: jest.fn() };
    sessionsGateway = { notifyFavoriteUpdate: jest.fn() };
    prisma.favorite.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FavoritesService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: SessionsGateway, useValue: sessionsGateway },
      ],
    }).compile();

    service = module.get(FavoritesService);
  });

  it('404s when the target does not exist', async () => {
    prisma.session.findFirst.mockResolvedValue(null);

    await expect(
      service.create('user-1', {
        type: FavoriteType.SESSION,
        targetId: 'missing',
      })
    ).rejects.toThrow(NotFoundException);
    expect(prisma.favorite.create).not.toHaveBeenCalled();
  });

  it('creates a favorite and notifies a different owner', async () => {
    prisma.session.findFirst.mockResolvedValue({
      id: 's1',
      name: 'Morning session',
      slug: 'morning-session',
      hostId: 'host-1',
    });
    prisma.favorite.create.mockResolvedValue({
      id: 'f1',
      userId: 'user-1',
      type: FavoriteType.SESSION,
      targetId: 's1',
    });
    prisma.notification.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      name: 'Player One',
      image: 'avatar.jpg',
    });

    await service.create('user-1', {
      type: FavoriteType.SESSION,
      targetId: 's1',
    });

    expect(notificationsService.createForUser).toHaveBeenCalledWith(
      'host-1',
      'SESSION',
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        action: 'session_favorited',
        actorId: 'user-1',
        sessionId: 's1',
      })
    );
    expect(sessionsGateway.notifyFavoriteUpdate).toHaveBeenCalledWith(
      FavoriteType.SESSION,
      's1',
      {
        favoriteCount: 0,
        actorId: 'user-1',
        isFavorite: true,
      }
    );
  });

  it('is idempotent and does not notify for a duplicate create request', async () => {
    prisma.session.findFirst.mockResolvedValue({
      id: 's1',
      name: 'Morning session',
      slug: 'morning-session',
      hostId: 'host-1',
    });
    prisma.favorite.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6.16.2',
      })
    );
    prisma.favorite.findUniqueOrThrow.mockResolvedValue({ id: 'f1' });

    await expect(
      service.create('user-1', {
        type: FavoriteType.SESSION,
        targetId: 's1',
      })
    ).resolves.toEqual({ id: 'f1' });
    expect(notificationsService.createForUser).not.toHaveBeenCalled();
    expect(sessionsGateway.notifyFavoriteUpdate).not.toHaveBeenCalled();
  });

  it('does not notify when the owner favorites their own target', async () => {
    prisma.club.findFirst.mockResolvedValue({
      id: 'c1',
      name: 'Club',
      slug: 'club',
      hostId: 'host-1',
    });
    prisma.favorite.create.mockResolvedValue({ id: 'f1' });

    await service.create('host-1', {
      type: FavoriteType.CLUB,
      targetId: 'c1',
    });

    expect(notificationsService.createForUser).not.toHaveBeenCalled();
  });

  it('deduplicates an unread notification after unlike and relike', async () => {
    prisma.tournament.findFirst.mockResolvedValue({
      id: 't1',
      name: 'Tournament',
      slug: 'tournament',
      hostId: 'host-1',
    });
    prisma.favorite.create.mockResolvedValue({ id: 'f1' });
    prisma.notification.findFirst.mockResolvedValue({ id: 'n1' });

    await service.create('user-1', {
      type: FavoriteType.TOURNAMENT,
      targetId: 't1',
    });

    expect(notificationsService.createForUser).not.toHaveBeenCalled();
  });

  it('returns favorite summary and allows an active club admin to view users', async () => {
    prisma.club.findFirst.mockResolvedValue({
      id: 'c1',
      name: 'Club',
      slug: 'club',
      hostId: 'host-1',
    });
    prisma.favorite.count.mockResolvedValue(4);
    prisma.favorite.findUnique.mockResolvedValue({ id: 'f1' });
    prisma.clubMember.findFirst.mockResolvedValue({ id: 'member-1' });

    await expect(
      service.getSummary('club-admin', 'PLAYER', FavoriteType.CLUB, 'c1')
    ).resolves.toEqual({
      isFavorite: true,
      favoriteCount: 4,
      canViewUsers: true,
    });
  });

  it('allows an assigned tournament manager with permissions to view users', async () => {
    prisma.tournament.findFirst.mockResolvedValue({
      id: 't1',
      name: 'Tournament',
      slug: 'tournament',
      hostId: 'host-1',
    });
    prisma.favorite.count.mockResolvedValue(1);
    prisma.favorite.findUnique.mockResolvedValue(null);
    prisma.tournamentManager.findUnique.mockResolvedValue({
      permissions: ['RESULTS'],
    });

    await expect(
      service.getSummary('manager-1', 'PLAYER', FavoriteType.TOURNAMENT, 't1')
    ).resolves.toEqual({
      isFavorite: false,
      favoriteCount: 1,
      canViewUsers: true,
    });
  });

  it('allows an assigned venue manager to view venue favorite users', async () => {
    prisma.venue.findFirst.mockResolvedValue({
      id: 'v1',
      name: 'Venue',
      slug: 'venue',
    });
    prisma.favorite.count.mockResolvedValue(2);
    prisma.favorite.findUnique.mockResolvedValue(null);
    prisma.venueManager.findUnique.mockResolvedValue({ id: 'vm1' });

    await expect(
      service.getSummary('manager-1', 'PLAYER', FavoriteType.VENUE, 'v1')
    ).resolves.toEqual({
      isFavorite: false,
      favoriteCount: 2,
      canViewUsers: true,
    });
  });

  it('rejects the favorite-user list for a regular user', async () => {
    prisma.session.findFirst.mockResolvedValue({
      id: 's1',
      name: 'Session',
      slug: 'session',
      hostId: 'host-1',
    });

    await expect(
      service.getFavoriteUsers(
        'user-1',
        'PLAYER',
        FavoriteType.SESSION,
        's1',
        1,
        20
      )
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns a private paginated user projection for authorized owners', async () => {
    prisma.session.findFirst.mockResolvedValue({
      id: 's1',
      name: 'Session',
      slug: 'session',
      hostId: 'host-1',
    });
    prisma.favorite.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-07-27T00:00:00Z'),
        user: { id: 'u1', name: 'Player', image: null },
      },
    ]);
    prisma.favorite.count.mockResolvedValue(1);

    const result = await service.getFavoriteUsers(
      'host-1',
      'HOST',
      FavoriteType.SESSION,
      's1',
      1,
      20
    );

    expect(result.data[0]).toEqual({
      id: 'u1',
      name: 'Player',
      image: null,
      favoritedAt: new Date('2026-07-27T00:00:00Z'),
    });
    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('keeps remove idempotent', async () => {
    prisma.favorite.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.remove('user-1', FavoriteType.SESSION, 's1')
    ).resolves.toEqual({ success: true });
    expect(sessionsGateway.notifyFavoriteUpdate).not.toHaveBeenCalled();
  });

  it('broadcasts the latest count after removing an existing favorite', async () => {
    prisma.favorite.deleteMany.mockResolvedValue({ count: 1 });
    prisma.favorite.count.mockResolvedValue(3);

    await service.remove('user-1', FavoriteType.CLUB, 'c1');

    expect(sessionsGateway.notifyFavoriteUpdate).toHaveBeenCalledWith(
      FavoriteType.CLUB,
      'c1',
      {
        favoriteCount: 3,
        actorId: 'user-1',
        isFavorite: false,
      }
    );
  });
});
