import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePlayerProfileDto,
  UpdatePlayerProfileDto,
  PromotePlayerProfileDto,
  QueryPlayerProfileDto,
} from './dto';
import { Prisma, Role, SportType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { tierForPoints } from '../points/points.constants';

@Injectable()
export class PlayerProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if user has permission to manage a club (owner, club admin, or system admin)
   */
  private async validateClubPermission(
    clubId: string,
    userId: string,
    userRole?: string
  ): Promise<boolean> {
    if (userRole === Role.ADMIN) return true;

    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { hostId: true },
    });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    if (club.hostId === userId) return true;

    const member = await this.prisma.clubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
      select: { role: true, status: true },
    });

    return member?.status === 'ACTIVE' && member?.role === 'ADMIN';
  }

  /**
   * Create a new managed player profile
   */
  async create(hostId: string, dto: CreatePlayerProfileDto, userRole?: string) {
    if (dto.clubId) {
      const hasPermission = await this.validateClubPermission(
        dto.clubId,
        hostId,
        userRole
      );
      if (!hasPermission) {
        throw new ForbiddenException(
          'You do not have permission to manage roster for this club'
        );
      }
    }

    return this.prisma.hostPlayerProfile.create({
      data: {
        hostId,
        clubId: dto.clubId || null,
        name: dto.name.trim(),
        gender: dto.gender,
        phone: dto.phone?.trim() || null,
        level: dto.level ?? null,
        notes: dto.notes?.trim() || null,
      },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            color: true,
            logo: true,
          },
        },
      },
    });
  }

  /**
   * Get all player profiles owned by host or filtered by club
   */
  async findAll(hostId: string, query: QueryPlayerProfileDto) {
    const where: Prisma.HostPlayerProfileWhereInput = {
      status: query.status || 'ACTIVE',
    };

    if (query.clubId) {
      if (query.clubId === 'none') {
        where.hostId = hostId;
        where.clubId = null;
      } else {
        where.clubId = query.clubId;
      }
    } else {
      where.hostId = hostId;
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const profiles = await this.prisma.hostPlayerProfile.findMany({
      where,
      include: {
        club: {
          select: {
            id: true,
            name: true,
            color: true,
            logo: true,
          },
        },
        pointsStates: {
          select: {
            sport: true,
            totalPoints: true,
            tier: true,
          },
        },
        _count: {
          select: {
            players: true,
          },
        },
        players: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            createdAt: true,
            session: {
              select: {
                id: true,
                name: true,
                startTime: true,
              },
            },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return profiles.map((p) => {
      const lastSession = p.players[0];
      const badmintonPoints = p.pointsStates.find(
        (ps) => ps.sport === SportType.BADMINTON
      );

      return {
        id: p.id,
        name: p.name,
        gender: p.gender,
        phone: p.phone,
        level: p.level,
        notes: p.notes,
        status: p.status,
        clubId: p.clubId,
        club: p.club,
        linkedUserId: p.linkedUserId,
        promotedAt: p.promotedAt,
        totalSessions: p._count.players,
        lastPlayedAt: lastSession?.session?.startTime || lastSession?.createdAt || null,
        lastSessionName: lastSession?.session?.name || null,
        points: badmintonPoints?.totalPoints || 0,
        tier: badmintonPoints?.tier || 'BRONZE',
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });
  }

  /**
   * Get single profile
   */
  async findOne(id: string, requesterId: string, userRole?: string) {
    const profile = await this.prisma.hostPlayerProfile.findUnique({
      where: { id },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            color: true,
            logo: true,
            hostId: true,
          },
        },
        pointsStates: true,
        linkedUser: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Player profile not found');
    }

    const isOwner = profile.hostId === requesterId;
    const isClubAdmin =
      profile.club &&
      (await this.validateClubPermission(profile.club.id, requesterId, userRole));
    const isSysAdmin = userRole === Role.ADMIN;

    if (!isOwner && !isClubAdmin && !isSysAdmin) {
      throw new ForbiddenException('Access denied');
    }

    return profile;
  }

  /**
   * Get cross-session statistics for a player profile
   */
  async getStats(id: string, requesterId: string, userRole?: string) {
    const profile = await this.findOne(id, requesterId, userRole);

    // Fetch all session player slots for this profile
    const sessionPlayers = await this.prisma.player.findMany({
      where: { profileId: id },
      include: {
        session: {
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
            status: true,
            sportType: true,
          },
        },
        matchPlayers: {
          include: {
            match: {
              select: {
                id: true,
                status: true,
                isDraw: true,
                winnerIds: true,
                score: true,
                endTime: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalMatches = 0;
    let wins = 0;
    let losses = 0;
    let draws = 0;

    const sessionHistory = sessionPlayers.map((sp) => {
      let sessionWins = 0;
      let sessionLosses = 0;
      let sessionDraws = 0;

      for (const mp of sp.matchPlayers) {
        if (mp.match.status !== 'FINISHED') continue;
        totalMatches++;

        if (mp.match.isDraw) {
          draws++;
          sessionDraws++;
        } else {
          const winners = mp.match.winnerIds
            ? mp.match.winnerIds.split(',').map((w) => w.trim())
            : [];
          if (winners.includes(sp.id)) {
            wins++;
            sessionWins++;
          } else {
            losses++;
            sessionLosses++;
          }
        }
      }

      return {
        sessionId: sp.session.id,
        sessionName: sp.session.name,
        sportType: sp.session.sportType,
        startTime: sp.session.startTime,
        status: sp.session.status,
        playerNumber: sp.playerNumber,
        matchesPlayed: sp.matchPlayers.length,
        wins: sessionWins,
        losses: sessionLosses,
        draws: sessionDraws,
      };
    });

    const winRate =
      totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

    return {
      profileId: profile.id,
      name: profile.name,
      gender: profile.gender,
      level: profile.level,
      status: profile.status,
      linkedUserId: profile.linkedUserId,
      totalSessions: sessionPlayers.length,
      totalMatches,
      wins,
      losses,
      draws,
      winRate,
      pointsStates: profile.pointsStates,
      sessionHistory,
    };
  }

  /**
   * Update player profile
   */
  async update(
    id: string,
    requesterId: string,
    dto: UpdatePlayerProfileDto,
    userRole?: string
  ) {
    const profile = await this.findOne(id, requesterId, userRole);

    if (dto.clubId && dto.clubId !== profile.clubId) {
      const hasPermission = await this.validateClubPermission(
        dto.clubId,
        requesterId,
        userRole
      );
      if (!hasPermission) {
        throw new ForbiddenException(
          'You do not have permission to assign to this club'
        );
      }
    }

    return this.prisma.hostPlayerProfile.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.phone !== undefined && {
          phone: dto.phone ? dto.phone.trim() : null,
        }),
        ...(dto.level !== undefined && { level: dto.level }),
        ...(dto.notes !== undefined && {
          notes: dto.notes ? dto.notes.trim() : null,
        }),
        ...(dto.clubId !== undefined && { clubId: dto.clubId }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            color: true,
            logo: true,
          },
        },
      },
    });
  }

  /**
   * Delete or archive player profile
   */
  async delete(id: string, requesterId: string, userRole?: string) {
    const profile = await this.findOne(id, requesterId, userRole);

    const sessionCount = await this.prisma.player.count({
      where: { profileId: id },
    });

    if (sessionCount > 0) {
      // Archive if already played in sessions
      return this.prisma.hostPlayerProfile.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      });
    }

    return this.prisma.hostPlayerProfile.delete({
      where: { id },
    });
  }

  /**
   * Promote managed player profile to a full User account
   */
  async promote(
    id: string,
    requesterId: string,
    dto: PromotePlayerProfileDto,
    userRole?: string
  ) {
    const profile = await this.findOne(id, requesterId, userRole);

    if (profile.status === 'PROMOTED' || profile.linkedUserId) {
      throw new BadRequestException('This profile has already been promoted');
    }

    const email = dto.email.toLowerCase().trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists in the system'
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const userName = (dto.name || profile.name).trim();

    return this.prisma.$transaction(async (tx) => {
      // 1. Create real User account
      const newUser = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name: userName,
          gender: profile.gender,
          phone: profile.phone,
          level: profile.level,
          role: Role.PLAYER,
          emailVerified: new Date(),
        },
      });

      // 2. Backfill all existing Player session slots
      await tx.player.updateMany({
        where: { profileId: profile.id },
        data: {
          userId: newUser.id,
          isGuest: false,
        },
      });

      // 3. Migrate all PointTransactions from guestProfileId to newUser.id
      await tx.pointTransaction.updateMany({
        where: { guestProfileId: profile.id },
        data: {
          userId: newUser.id,
          guestProfileId: null,
        },
      });

      // 4. Calculate total points and upsert UserPointsState for Badminton
      const pointSums = await tx.pointTransaction.groupBy({
        by: ['sport'],
        where: { userId: newUser.id },
        _sum: { points: true },
      });

      for (const group of pointSums) {
        const totalPoints = group._sum.points || 0;
        const tier = tierForPoints(totalPoints);
        await tx.userPointsState.upsert({
          where: {
            userId_sport: {
              userId: newUser.id,
              sport: group.sport,
            },
          },
          create: {
            userId: newUser.id,
            sport: group.sport,
            totalPoints,
            tier,
          },
          update: {
            totalPoints,
            tier,
          },
        });
      }

      // Delete guest profile points state as it is now migrated
      await tx.guestProfilePointsState.deleteMany({
        where: { profileId: profile.id },
      });

      // 5. If profile belongs to a Club, add User as ClubMember
      if (profile.clubId) {
        const existingMember = await tx.clubMember.findUnique({
          where: {
            clubId_userId: {
              clubId: profile.clubId,
              userId: newUser.id,
            },
          },
        });

        if (!existingMember) {
          await tx.clubMember.create({
            data: {
              clubId: profile.clubId,
              userId: newUser.id,
              role: 'MEMBER',
              status: 'ACTIVE',
            },
          });
        }
      }

      // 6. Update HostPlayerProfile status to PROMOTED
      const updatedProfile = await tx.hostPlayerProfile.update({
        where: { id: profile.id },
        data: {
          status: 'PROMOTED',
          linkedUserId: newUser.id,
          promotedAt: new Date(),
        },
      });

      return {
        message: 'Profile successfully promoted to user',
        profile: updatedProfile,
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
        },
      };
    });
  }
}
