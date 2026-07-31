import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Favorite,
  FavoriteType,
  MemberRole,
  MemberStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SessionsGateway } from '../sessions/sessions.gateway';
import { VENUE_PUBLIC_OMIT } from '../venues/venue-public-omit.constant';
import { CreateFavoriteDto } from './dto/create-favorite.dto';

type FavoriteTarget = {
  id: string;
  name: string;
  slug: string | null;
  ownerId: string | null;
};

const ENGAGEMENT_TYPES = new Set<FavoriteType>([
  FavoriteType.SESSION,
  FavoriteType.CLUB,
  FavoriteType.TOURNAMENT,
  FavoriteType.VENUE,
]);

@Injectable()
export class FavoritesService {
  private readonly logger = new Logger(FavoritesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly sessionsGateway: SessionsGateway
  ) {}

  async create(userId: string, dto: CreateFavoriteDto) {
    const target = await this.getTarget(dto.type, dto.targetId);

    let favorite: Favorite;
    try {
      favorite = await this.prisma.favorite.create({
        data: { userId, type: dto.type, targetId: target.id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.favorite.findUniqueOrThrow({
          where: {
            userId_type_targetId: {
              userId,
              type: dto.type,
              targetId: target.id,
            },
          },
        });
      }
      throw error;
    }

    if (ENGAGEMENT_TYPES.has(dto.type)) {
      await this.emitFavoriteUpdate(userId, dto.type, target.id, true);

      if (target.ownerId !== userId) {
        await this.notifyOwner(userId, dto.type, target);
      }
    }

    return favorite;
  }

  async remove(userId: string, type: FavoriteType, targetId: string) {
    const result = await this.prisma.favorite.deleteMany({
      where: { userId, type, targetId },
    });

    if (result.count > 0 && ENGAGEMENT_TYPES.has(type)) {
      await this.emitFavoriteUpdate(userId, type, targetId, false);
    }

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

    const targetIds = favorites.map((favorite) => favorite.targetId);
    const targets = await this.findTargetsByIds(type, targetIds);
    const targetById = new Map(targets.map((target) => [target.id, target]));
    const data = favorites
      .filter((favorite) => targetById.has(favorite.targetId))
      .map((favorite) => ({
        ...targetById.get(favorite.targetId)!,
        isFavorite: true,
        favoritedAt: favorite.createdAt,
      }));

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSummary(
    userId: string,
    role: string,
    type: FavoriteType,
    targetId: string
  ) {
    this.assertEngagementType(type);
    const target = await this.getTarget(type, targetId);
    const [favoriteCount, favorite, canViewUsers] = await Promise.all([
      this.prisma.favorite.count({ where: { type, targetId: target.id } }),
      this.prisma.favorite.findUnique({
        where: {
          userId_type_targetId: { userId, type, targetId: target.id },
        },
        select: { id: true },
      }),
      this.canViewFavoriteUsers(userId, role, type, target),
    ]);

    return {
      isFavorite: Boolean(favorite),
      favoriteCount,
      canViewUsers,
    };
  }

  async getFavoriteUsers(
    userId: string,
    role: string,
    type: FavoriteType,
    targetId: string,
    page: number,
    limit: number
  ) {
    this.assertEngagementType(type);
    const target = await this.getTarget(type, targetId);
    if (!(await this.canViewFavoriteUsers(userId, role, type, target))) {
      throw new ForbiddenException(
        'You do not have permission to view favorite users'
      );
    }

    const where = { type, targetId: target.id };
    const skip = (page - 1) * limit;
    const [favorites, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          createdAt: true,
          user: { select: { id: true, name: true, image: true } },
        },
      }),
      this.prisma.favorite.count({ where }),
    ]);

    return {
      data: favorites.map(({ user, createdAt }) => ({
        ...user,
        favoritedAt: createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

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
    return new Set(favorites.map((favorite) => favorite.targetId));
  }

  async getFavoritedTargetIds(
    userId: string,
    type: FavoriteType
  ): Promise<string[]> {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId, type },
      select: { targetId: true },
    });
    return favorites.map((favorite) => favorite.targetId);
  }

  private assertEngagementType(type: FavoriteType) {
    if (!ENGAGEMENT_TYPES.has(type)) {
      throw new BadRequestException(
        'Favorite engagement is only available for sessions, clubs, tournaments, and venues'
      );
    }
  }

  private async canViewFavoriteUsers(
    userId: string,
    role: string,
    type: FavoriteType,
    target: FavoriteTarget
  ): Promise<boolean> {
    if (role === 'ADMIN' || (target.ownerId && target.ownerId === userId))
      return true;

    if (type === FavoriteType.CLUB) {
      const membership = await this.prisma.clubMember.findFirst({
        where: {
          clubId: target.id,
          userId,
          role: MemberRole.ADMIN,
          status: MemberStatus.ACTIVE,
        },
        select: { id: true },
      });
      return Boolean(membership);
    }

    if (type === FavoriteType.TOURNAMENT) {
      const manager = await this.prisma.tournamentManager.findUnique({
        where: {
          tournamentId_userId: { tournamentId: target.id, userId },
        },
        select: { permissions: true },
      });
      return Boolean(manager?.permissions.length);
    }

    if (type === FavoriteType.VENUE) {
      const manager = await this.prisma.venueManager.findUnique({
        where: {
          venueId_userId: { venueId: target.id, userId },
        },
        select: { id: true },
      });
      return Boolean(manager);
    }

    return false;
  }

  private async notifyOwner(
    actorId: string,
    type: FavoriteType,
    target: FavoriteTarget
  ) {
    if (!target.ownerId) return;
    const action = `${type.toLowerCase()}_favorited`;

    try {
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: target.ownerId,
          isRead: false,
          AND: [
            { data: { path: ['actorId'], equals: actorId } },
            { data: { path: ['targetId'], equals: target.id } },
            { data: { path: ['action'], equals: action } },
          ],
        },
        select: { id: true },
      });
      if (existing) return;

      const actor = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true, image: true },
      });
      const actorName = actor?.name || 'A user';
      const typeLabel =
        type === FavoriteType.SESSION
          ? 'session'
          : type === FavoriteType.CLUB
            ? 'club'
            : 'tournament';
      const typeKey = typeLabel;

      await this.notificationsService.createForUser(
        target.ownerId,
        type === FavoriteType.SESSION
          ? NotificationType.SESSION
          : type === FavoriteType.CLUB
            ? NotificationType.CLUB
            : NotificationType.TOURNAMENT,
        `New like on your ${typeLabel}`,
        `${actorName} liked your ${typeLabel}.`,
        {
          action,
          actorId,
          actorName,
          actorAvatar: actor?.image ?? null,
          favoriteType: type,
          targetId: target.id,
          [`${typeKey}Id`]: target.id,
          [`${typeKey}Slug`]: target.slug,
          [`${typeKey}Name`]: target.name,
        }
      );
    } catch (error) {
      this.logger.warn(
        `Failed to notify owner about ${type} favorite ${target.id}: ${String(error)}`
      );
    }
  }

  private async emitFavoriteUpdate(
    actorId: string,
    type: FavoriteType,
    targetId: string,
    isFavorite: boolean
  ) {
    try {
      const favoriteCount = await this.prisma.favorite.count({
        where: { type, targetId },
      });
      this.sessionsGateway.notifyFavoriteUpdate(type, targetId, {
        favoriteCount,
        actorId,
        isFavorite,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to emit ${type} favorite update ${targetId}: ${String(error)}`
      );
    }
  }

  private async getTarget(
    type: FavoriteType,
    targetId: string
  ): Promise<FavoriteTarget> {
    let target: FavoriteTarget | null = null;

    if (type === FavoriteType.SESSION) {
      const session = await this.prisma.session.findFirst({
        where: { OR: [{ id: targetId }, { slug: targetId }] },
        select: { id: true, name: true, slug: true, hostId: true },
      });
      target = session ? { ...session, ownerId: session.hostId } : null;
    } else if (type === FavoriteType.CLUB) {
      const club = await this.prisma.club.findFirst({
        where: { OR: [{ id: targetId }, { slug: targetId }] },
        select: { id: true, name: true, slug: true, hostId: true },
      });
      target = club ? { ...club, ownerId: club.hostId } : null;
    } else if (type === FavoriteType.TOURNAMENT) {
      const tournament = await this.prisma.tournament.findFirst({
        where: { OR: [{ id: targetId }, { slug: targetId }] },
        select: { id: true, name: true, slug: true, hostId: true },
      });
      target = tournament
        ? { ...tournament, ownerId: tournament.hostId }
        : null;
    } else {
      const venue = await this.prisma.venue.findFirst({
        where: { OR: [{ id: targetId }, { slug: targetId }] },
        select: { id: true, name: true, slug: true },
      });
      target = venue ? { ...venue, ownerId: null } : null;
    }

    if (!target) {
      throw new NotFoundException(
        `${type.toLowerCase()} ${targetId} not found`
      );
    }
    return target;
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
