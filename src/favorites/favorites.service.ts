import { Injectable, NotFoundException } from '@nestjs/common';
import { FavoriteType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VENUE_PUBLIC_OMIT } from '../venues/venue-public-omit.constant';
import { CreateFavoriteDto } from './dto/create-favorite.dto';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateFavoriteDto) {
    await this.ensureTargetExists(dto.type, dto.targetId);

    return this.prisma.favorite.upsert({
      where: {
        userId_type_targetId: {
          userId,
          type: dto.type,
          targetId: dto.targetId,
        },
      },
      create: { userId, type: dto.type, targetId: dto.targetId },
      update: {},
    });
  }

  async remove(userId: string, type: FavoriteType, targetId: string) {
    await this.prisma.favorite.deleteMany({
      where: { userId, type, targetId },
    });
    return { success: true };
  }

  async findUserFavorites(
    userId: string,
    type: FavoriteType,
    page: number,
    limit: number
  ) {
    const skip = (page - 1) * limit;

    const [favorites, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { userId, type },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.favorite.count({ where: { userId, type } }),
    ]);

    const targetIds = favorites.map((f) => f.targetId);
    const targets = await this.findTargetsByIds(type, targetIds);
    const targetById = new Map(targets.map((t) => [t.id, t]));

    const data = favorites
      .filter((f) => targetById.has(f.targetId))
      .map((f) => ({
        ...targetById.get(f.targetId)!,
        isFavorite: true,
        favoritedAt: f.createdAt,
      }));

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Batch lookup: which of `targetIds` (already fetched by the caller for the
   * current page) the user has favorited. Favorite has no FK relation to
   * Session/Venue/Club/Tournament (polymorphic via targetId), so this can't
   * be folded into the callers' own `findMany` via a relation include.
   */
  async isFavoritedMap(
    userId: string,
    type: FavoriteType,
    targetIds: string[]
  ): Promise<Set<string>> {
    if (targetIds.length === 0) return new Set();

    const favorites = await this.prisma.favorite.findMany({
      where: { userId, type, targetId: { in: targetIds } },
      select: { targetId: true },
    });
    return new Set(favorites.map((f) => f.targetId));
  }

  async getFavoritedTargetIds(
    userId: string,
    type: FavoriteType
  ): Promise<string[]> {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId, type },
      select: { targetId: true },
    });
    return favorites.map((f) => f.targetId);
  }

  private async ensureTargetExists(type: FavoriteType, targetId: string) {
    const exists = await this.targetExists(type, targetId);
    if (!exists) {
      throw new NotFoundException(
        `${type.toLowerCase()} ${targetId} not found`
      );
    }
  }

  private async targetExists(
    type: FavoriteType,
    targetId: string
  ): Promise<boolean> {
    switch (type) {
      case FavoriteType.SESSION:
        return !!(await this.prisma.session.findUnique({
          where: { id: targetId },
          select: { id: true },
        }));
      case FavoriteType.VENUE:
        return !!(await this.prisma.venue.findUnique({
          where: { id: targetId },
          select: { id: true },
        }));
      case FavoriteType.CLUB:
        return !!(await this.prisma.club.findUnique({
          where: { id: targetId },
          select: { id: true },
        }));
      case FavoriteType.TOURNAMENT:
        return !!(await this.prisma.tournament.findUnique({
          where: { id: targetId },
          select: { id: true },
        }));
    }
  }

  private async findTargetsByIds(type: FavoriteType, ids: string[]) {
    if (ids.length === 0) return [] as Array<{ id: string }>;

    switch (type) {
      case FavoriteType.SESSION:
        return this.prisma.session.findMany({
          where: { id: { in: ids } },
          include: {
            host: { select: { id: true, name: true, image: true } },
            venue: {
              select: {
                id: true,
                name: true,
                address: true,
                city: true,
                district: true,
              },
            },
            _count: {
              select: {
                players: { where: { registrationStatus: 'APPROVED' as const } },
              },
            },
          },
        });
      case FavoriteType.VENUE:
        return this.prisma.venue.findMany({
          where: { id: { in: ids } },
          omit: VENUE_PUBLIC_OMIT,
        });
      case FavoriteType.CLUB:
        return this.prisma.club.findMany({
          where: { id: { in: ids } },
          include: {
            host: { select: { id: true, name: true, image: true } },
            defaultVenue: {
              select: {
                id: true,
                name: true,
                address: true,
                city: true,
                district: true,
              },
            },
            _count: {
              select: { members: { where: { status: 'ACTIVE' as const } } },
            },
          },
        });
      case FavoriteType.TOURNAMENT:
        return this.prisma.tournament.findMany({
          where: { id: { in: ids } },
          include: {
            host: { select: { id: true, name: true, image: true } },
            _count: {
              select: { players: true, pairs: true, categories: true },
            },
          },
        });
    }
  }
}
