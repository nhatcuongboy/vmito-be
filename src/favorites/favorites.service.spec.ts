import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FavoriteType } from '@prisma/client';
import { FavoritesService } from './favorites.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FavoritesService', () => {
  let service: FavoritesService;
  let prisma: {
    favorite: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    session: { findUnique: jest.Mock };
    venue: { findUnique: jest.Mock; findMany: jest.Mock };
    club: { findUnique: jest.Mock };
    tournament: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      favorite: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      session: { findUnique: jest.fn() },
      venue: { findUnique: jest.fn(), findMany: jest.fn() },
      club: { findUnique: jest.fn() },
      tournament: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FavoritesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(FavoritesService);
  });

  describe('create', () => {
    it('404s when the target does not exist', async () => {
      prisma.venue.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', { type: FavoriteType.VENUE, targetId: 'v1' })
      ).rejects.toThrow(NotFoundException);
      expect(prisma.favorite.upsert).not.toHaveBeenCalled();
    });

    it('is duplicate-safe: upserts on the compound key instead of erroring on repeat calls', async () => {
      prisma.venue.findUnique.mockResolvedValue({ id: 'v1' });
      prisma.favorite.upsert.mockResolvedValue({
        id: 'f1',
        userId: 'user-1',
        type: FavoriteType.VENUE,
        targetId: 'v1',
      });

      await service.create('user-1', {
        type: FavoriteType.VENUE,
        targetId: 'v1',
      });
      await service.create('user-1', {
        type: FavoriteType.VENUE,
        targetId: 'v1',
      });

      expect(prisma.favorite.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.favorite.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_type_targetId: {
              userId: 'user-1',
              type: FavoriteType.VENUE,
              targetId: 'v1',
            },
          },
          update: {},
        })
      );
    });
  });

  describe('remove', () => {
    it('is idempotent: unfavoriting an already-unfavorited target does not error', async () => {
      prisma.favorite.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.remove('user-1', FavoriteType.VENUE, 'v1')
      ).resolves.toEqual({ success: true });
    });
  });

  describe('getFavoritedTargetIds', () => {
    it('returns the target ids favorited by the user for the given type', async () => {
      prisma.favorite.findMany.mockResolvedValue([
        { targetId: 'v1' },
        { targetId: 'v2' },
      ]);

      const ids = await service.getFavoritedTargetIds(
        'user-1',
        FavoriteType.VENUE
      );

      expect(ids).toEqual(['v1', 'v2']);
      expect(prisma.favorite.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', type: FavoriteType.VENUE },
        select: { targetId: true },
      });
    });
  });

  describe('isFavoritedMap', () => {
    it('returns an empty set without querying when targetIds is empty', async () => {
      const result = await service.isFavoritedMap(
        'user-1',
        FavoriteType.VENUE,
        []
      );

      expect(result.size).toBe(0);
      expect(prisma.favorite.findMany).not.toHaveBeenCalled();
    });

    it('builds a set of favorited target ids among the given page of ids', async () => {
      prisma.favorite.findMany.mockResolvedValue([{ targetId: 'v2' }]);

      const result = await service.isFavoritedMap(
        'user-1',
        FavoriteType.VENUE,
        ['v1', 'v2', 'v3']
      );

      expect(result).toEqual(new Set(['v2']));
    });
  });
});
