import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatingDto, GetRatingsDto } from './dto';
import { RatingType, SessionStatus, Prisma } from '@prisma/client';

@Injectable()
export class RatingsService {
  private readonly ratingSelect = {
    id: true,
    sessionId: true,
    raterUserId: true,
    ratedUserId: true,
    type: true,
    rating: true,
    comment: true,
    createdAt: true,
    updatedAt: true,
  };

  private readonly ratingWithUsersSelect = {
    ...this.ratingSelect,
    rater: {
      select: {
        id: true,
        name: true,
        image: true,
      },
    },
    rated: {
      select: {
        id: true,
        name: true,
        image: true,
      },
    },
    session: {
      select: {
        id: true,
        name: true,
        startTime: true,
      },
    },
  };

  constructor(private prisma: PrismaService) {}

  // Create a new rating
  async create(dto: CreateRatingDto, raterUserId: string, role?: string) {
    // Verify session exists and is finished
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
      select: {
        id: true,
        hostId: true,
        status: true,
        players: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== SessionStatus.FINISHED) {
      throw new BadRequestException('Can only rate after session is finished');
    }

    // Verify rating type and permissions
    if (dto.type === RatingType.PLAYER_TO_HOST) {
      // Player rating host - verify rater was a player in the session
      const wasPlayer = session.players.some((p) => p.userId === raterUserId);
      if (!wasPlayer) {
        throw new ForbiddenException('Only session players can rate the host');
      }
      // Verify rated user is the host
      if (dto.ratedUserId !== session.hostId) {
        throw new BadRequestException('Rated user must be the session host');
      }
    } else if (dto.type === RatingType.HOST_TO_PLAYER) {
      // Host rating player - verify rater is the host or admin
      if (role !== 'ADMIN' && raterUserId !== session.hostId) {
        throw new ForbiddenException('Only session host can rate players');
      }
      // Verify rated user was a player in the session
      const wasPlayer = session.players.some(
        (p) => p.userId === dto.ratedUserId
      );
      if (!wasPlayer) {
        throw new BadRequestException('Rated user must be a session player');
      }
    }

    // Check for duplicate rating
    const existing = await this.prisma.rating.findUnique({
      where: {
        sessionId_raterUserId_ratedUserId_type: {
          sessionId: dto.sessionId,
          raterUserId,
          ratedUserId: dto.ratedUserId,
          type: dto.type,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'You have already rated this user for this session'
      );
    }

    // Create the rating
    return this.prisma.rating.create({
      data: {
        sessionId: dto.sessionId,
        raterUserId,
        ratedUserId: dto.ratedUserId,
        type: dto.type,
        rating: dto.rating,
        comment: dto.comment,
      },
      select: this.ratingWithUsersSelect,
    });
  }

  // Get ratings with filters
  async findMany(query: GetRatingsDto) {
    const where: Prisma.RatingWhereInput = {};

    if (query.sessionId) {
      where.sessionId = query.sessionId;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.raterUserId) {
      where.raterUserId = query.raterUserId;
    }
    if (query.ratedUserId) {
      where.ratedUserId = query.ratedUserId;
    }
    if (query.userId) {
      where.OR = [{ raterUserId: query.userId }, { ratedUserId: query.userId }];
    }

    return this.prisma.rating.findMany({
      where,
      select: this.ratingWithUsersSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get session rating eligibility for current user
  async getSessionEligibility(sessionId: string, userId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        hostId: true,
        status: true,
        players: {
          where: {
            userId: { not: null },
          },
          select: {
            userId: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const isHost = session.hostId === userId;
    const isPlayer = session.players.some((p) => p.userId === userId);
    const isFinished = session.status === SessionStatus.FINISHED;

    // Get existing ratings by this user for this session
    const existingRatings = await this.prisma.rating.findMany({
      where: {
        sessionId,
        raterUserId: userId,
      },
      select: this.ratingWithUsersSelect,
    });

    // Determine who can be rated
    let canRateHost = false;
    let hasRatedHost = false;
    let hostRating: (typeof existingRatings)[0] | null = null;
    const canRatePlayers: string[] = [];
    const ratedPlayerIds: string[] = [];
    const playerRatings: Array<(typeof existingRatings)[0]> = [];

    if (isFinished) {
      if (isPlayer) {
        // Player can rate host
        canRateHost = true;
        const hostRatingRecord = existingRatings.find(
          (r) =>
            r.ratedUserId === session.hostId &&
            r.type === RatingType.PLAYER_TO_HOST
        );
        if (hostRatingRecord) {
          hasRatedHost = true;
          hostRating = hostRatingRecord;
        }
      }

      if (isHost) {
        // Host can rate all players with userId
        for (const player of session.players) {
          if (player.userId && player.userId !== userId) {
            const playerRatingRecord = existingRatings.find(
              (r) =>
                r.ratedUserId === player.userId &&
                r.type === RatingType.HOST_TO_PLAYER
            );
            if (playerRatingRecord) {
              ratedPlayerIds.push(player.userId);
              playerRatings.push(playerRatingRecord);
            } else {
              canRatePlayers.push(player.userId);
            }
          }
        }
      }
    }

    return {
      sessionId,
      isHost,
      isPlayer,
      isFinished,
      canRateHost: canRateHost && !hasRatedHost,
      hasRatedHost,
      hostRating,
      canRatePlayers,
      ratedPlayerIds,
      playerRatings,
    };
  }

  // Get rating stats for multiple users (batch)
  async getBatchUserStats(userIds: string[]) {
    if (!userIds || userIds.length === 0) {
      return [];
    }

    // Remove duplicates
    const uniqueUserIds = [...new Set(userIds)];

    // Fetch all ratings for these users in one query
    const receivedRatings = await this.prisma.rating.findMany({
      where: { ratedUserId: { in: uniqueUserIds } },
      select: {
        ratedUserId: true,
        rating: true,
        type: true,
      },
    });

    // Group ratings by user
    const ratingsByUser = new Map<
      string,
      Array<{ ratedUserId: string; rating: number; type: RatingType }>
    >();
    for (const rating of receivedRatings) {
      if (!ratingsByUser.has(rating.ratedUserId)) {
        ratingsByUser.set(rating.ratedUserId, []);
      }
      ratingsByUser.get(rating.ratedUserId)!.push(rating);
    }

    // Calculate stats for each user
    return uniqueUserIds.map((userId) => {
      const userRatings = ratingsByUser.get(userId) || [];
      const totalRatings = userRatings.length;
      const averageRating =
        totalRatings > 0
          ? userRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
          : 0;

      const asHost = userRatings.filter(
        (r) => r.type === RatingType.PLAYER_TO_HOST
      );
      const asPlayer = userRatings.filter(
        (r) => r.type === RatingType.HOST_TO_PLAYER
      );

      return {
        userId,
        averageRating: Math.round(averageRating * 10) / 10,
        totalRatings,
        asHost: {
          averageRating:
            asHost.length > 0
              ? Math.round(
                  (asHost.reduce((sum, r) => sum + r.rating, 0) /
                    asHost.length) *
                    10
                ) / 10
              : 0,
          totalRatings: asHost.length,
        },
        asPlayer: {
          averageRating:
            asPlayer.length > 0
              ? Math.round(
                  (asPlayer.reduce((sum, r) => sum + r.rating, 0) /
                    asPlayer.length) *
                    10
                ) / 10
              : 0,
          totalRatings: asPlayer.length,
        },
      };
    });
  }

  // Get user rating stats
  async getUserStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const receivedRatings = await this.prisma.rating.findMany({
      where: { ratedUserId: userId },
      select: {
        rating: true,
        type: true,
      },
    });

    const totalRatings = receivedRatings.length;
    const averageRating =
      totalRatings > 0
        ? receivedRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
        : 0;

    // Breakdown by type
    const asHost = receivedRatings.filter(
      (r) => r.type === RatingType.PLAYER_TO_HOST
    );
    const asPlayer = receivedRatings.filter(
      (r) => r.type === RatingType.HOST_TO_PLAYER
    );

    return {
      userId,
      averageRating: Math.round(averageRating * 10) / 10,
      totalRatings,
      asHost: {
        averageRating:
          asHost.length > 0
            ? Math.round(
                (asHost.reduce((sum, r) => sum + r.rating, 0) / asHost.length) *
                  10
              ) / 10
            : 0,
        totalRatings: asHost.length,
      },
      asPlayer: {
        averageRating:
          asPlayer.length > 0
            ? Math.round(
                (asPlayer.reduce((sum, r) => sum + r.rating, 0) /
                  asPlayer.length) *
                  10
              ) / 10
            : 0,
        totalRatings: asPlayer.length,
      },
    };
  }

  // Get ratings received by user
  async getUserReceivedRatings(userId: string) {
    return this.prisma.rating.findMany({
      where: { ratedUserId: userId },
      select: this.ratingWithUsersSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get ratings given by user
  async getUserGivenRatings(userId: string) {
    return this.prisma.rating.findMany({
      where: { raterUserId: userId },
      select: this.ratingWithUsersSelect,
      orderBy: { createdAt: 'desc' },
    });
  }
}
