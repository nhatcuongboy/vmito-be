import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { ConfigService } from '@nestjs/config';
import { CourtDirection, Prisma } from '@prisma/client';
import { VALID_LEVELS } from '../common/constants/level.constants';

import { SessionsGateway } from './sessions.gateway';

@Injectable()
export class SessionsService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private sessionsGateway: SessionsGateway
  ) {}

  async findAll(user?: { userId: string; role: string }) {
    const where: { hostId?: string } = {};

    if (user && user.role === 'HOST') {
      where.hostId = user.userId;
    }

    return this.prisma.session.findMany({
      where,
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        venue: true,
        _count: {
          select: {
            players: { where: { registrationStatus: 'APPROVED' as const } },
            courts: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findAvailable(filters?: { date?: string; level?: number }) {
    const where: Prisma.SessionWhereInput = {
      status: 'PREPARING', // Only show sessions that haven't started (or maybe allow IN_PROGRESS too?)
      endTime: {
        gt: new Date(),
      },
    };

    if (filters?.date) {
      const date = new Date(filters.date);
      const startOfDay = new Date(date.setHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setHours(23, 59, 59, 999));

      where.startTime = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    if (filters?.level) {
      // If session has no specific level requirements (empty array), it's open to all
      // OR if the session's requiredLevels includes the players level
      // Prisma doesn't support "array contains X OR array is empty" easily in one clause without raw query or careful structure
      // For now, let's filter in memory or simplify.

      // Option 1: Filter sessions that include this level in requiredLevels OR requiredLevels is empty
      where.OR = [
        { requiredLevels: { has: Number(filters.level) } }, // Array contains level
        { requiredLevels: { equals: [] } }, // Array is empty (open to all)
      ];
    }

    return this.prisma.session.findMany({
      where,
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        venue: true,
        _count: {
          select: {
            players: { where: { registrationStatus: 'APPROVED' as const } }, // Count approved players only
            courts: true,
          },
        },
        // We might want to see how many approved/pending players there are specifically, but _count gives total.
      },
      orderBy: {
        startTime: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        venue: true,
        courts: {
          orderBy: {
            courtNumber: 'asc',
          },
          include: {
            currentPlayers: {
              select: {
                id: true,
                playerNumber: true,
                name: true,
                gender: true,
                level: true,
                levelDescription: true,
                desire: true,
                requireConfirmInfo: true,
                status: true,
                currentCourtId: true,
                courtPosition: true,
                updatedAt: true,
              },
              orderBy: {
                courtPosition: 'asc',
              },
            },
            currentMatch: {
              include: {
                players: {
                  include: {
                    player: {
                      select: {
                        id: true,
                        playerNumber: true,
                        name: true,
                        courtPosition: true,
                      },
                    },
                  },
                  orderBy: {
                    position: 'asc',
                  },
                },
              },
            },
          },
        },
        players: {
          where: {
            registrationStatus: { in: ['APPROVED', 'PENDING'] },
          },
          orderBy: {
            playerNumber: 'asc',
          },
          select: {
            id: true,
            userId: true,
            playerNumber: true,
            name: true,
            gender: true,
            level: true,
            levelDescription: true,
            desire: true,
            currentWaitTime: true,
            totalWaitTime: true,
            matchesPlayed: true,
            status: true,
            currentCourtId: true,
            courtPosition: true,
            preFilledByHost: true,
            confirmedByPlayer: true,
            requireConfirmInfo: true,
            joinCode: true,
            registrationStatus: true,

            currentCourt: {
              select: {
                id: true,
                courtName: true,
                courtNumber: true,
              },
            },
            user: {
              select: {
                image: true,
              },
            },
          },
        },
        _count: {
          select: {
            players: { where: { registrationStatus: 'APPROVED' as const } as const },
            courts: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Process courts to add position information to currentPlayers
    const processedCourts = session.courts.map((court) => {
      let playersWithPosition = [...court.currentPlayers];

      // If court has an active match, get positions from MatchPlayer
      if (court.currentMatch && court.currentMatch.players.length > 0) {
        const matchPlayerPositions = court.currentMatch.players.reduce(
          (acc, mp) => {
            acc[mp.playerId] = mp.position;
            return acc;
          },
          {} as Record<string, number>
        );

        // Sort players by their match position
        playersWithPosition = court.currentPlayers
          .map((player) => ({
            ...player,
            position: matchPlayerPositions[player.id] ?? 0,
          }))
          .sort((a, b) => a.position - b.position);
      } else {
        // For READY courts (no active match), use stored courtPosition
        playersWithPosition = court.currentPlayers.map((player) => ({
          ...player,
          position: player.courtPosition ?? 0,
        }));
      }

      return {
        ...court,
        currentPlayers: playersWithPosition,
      };
    });

    const allPlayers = session.players.map(p => ({
      ...p,
      // registrationStatus is already in the select
    }));

    const approvedPlayers = allPlayers.filter(p => p.registrationStatus === 'APPROVED');
    const pendingPlayers = allPlayers.filter(p => p.registrationStatus === 'PENDING');

    return {
      ...session,
      players: approvedPlayers,
      pendingPlayers: pendingPlayers,
      courts: processedCourts,
    };
  }

  async create(createSessionDto: CreateSessionDto, hostId: string) {
    const {
      name,
      numberOfCourts = 2,
      sessionDuration = 120,
      maxPlayersPerCourt = 8,
      requirePlayerInfo = true,
      allowGuestJoin = true,
      allowNewPlayers = true,
      requiredLevels = [],
      startTime,
      endTime,
      description,
      location,
      hostName,
      hostPhone,
      venue,
      courtColor,
      courts: courtsConfig,
    } = createSessionDto;

    // Validate requiredLevels
    if (requiredLevels !== undefined && !Array.isArray(requiredLevels)) {
      throw new BadRequestException('requiredLevels must be an array');
    }

    const validLevels = VALID_LEVELS;
    const invalidLevels = requiredLevels?.filter(
      (level) => !validLevels.includes(level)
    );

    if (invalidLevels && invalidLevels.length > 0) {
      throw new BadRequestException(
        `Invalid level values: ${invalidLevels.join(', ')}. Valid levels are: ${validLevels.join(', ')}`
      );
    }

    // Determine actual number of courts
    const finalNumberOfCourts =
      courtsConfig && Array.isArray(courtsConfig) && courtsConfig.length > 0
        ? courtsConfig.length
        : numberOfCourts;

    // Check if host exists
    const host = await this.prisma.user.findUnique({
      where: { id: hostId },
    });

    if (!host) {
      throw new NotFoundException('Host not found');
    }

    // Handle Venue Logic
    let venueId: string | undefined;
    let finalLocation = location;

    if (venue) {
      let existingVenue = await this.prisma.venue.findUnique({
        where: { placeId: venue.placeId },
      });

      if (!existingVenue) {
        existingVenue = await this.prisma.venue.create({
          data: {
            placeId: venue.placeId,
            name: venue.name,
            address: venue.address,
            lat: venue.lat,
            lng: venue.lng,
            district: venue.district,
            city: venue.city,
          },
        });
      }
      venueId = existingVenue.id;
      // If location string is not provided, use venue address as fallback
      if (!finalLocation) {
        finalLocation = venue.address;
      }
    }

    // Create session
    const session = await this.prisma.session.create({
      data: {
        name,
        hostId,
        numberOfCourts: finalNumberOfCourts,
        sessionDuration,
        maxPlayersPerCourt,
        requirePlayerInfo,
        allowGuestJoin,
        allowNewPlayers,
        requiredLevels: requiredLevels || [],

        startTime: startTime ? new Date(startTime) : new Date(),
        endTime: endTime
          ? new Date(endTime)
          : new Date(Date.now() + sessionDuration * 60 * 1000),
        status: 'PREPARING',
        description,
        location: finalLocation,
        hostName,
        hostPhone,
        venueId,
        courtColor: courtColor || '#179a3b',
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        venue: true,
      },
    });

    // Create courts for the session
    const courts: Array<{
      sessionId: string;
      courtNumber: number;
      courtName: string | null;
      direction: CourtDirection;
      status: 'EMPTY';
    }> = [];

    if (courtsConfig && Array.isArray(courtsConfig)) {
      // Use provided courts configuration
      for (const courtConfig of courtsConfig) {
        courts.push({
          sessionId: session.id,
          courtNumber: courtConfig.courtNumber,
          courtName: courtConfig.courtName || null,
          direction: courtConfig.direction || CourtDirection.HORIZONTAL,
          status: 'EMPTY' as const,
        });
      }
    } else {
      // Use default sequential courts
      for (let i = 1; i <= session.numberOfCourts; i++) {
        courts.push({
          sessionId: session.id,
          courtNumber: i,
          courtName: null,
          direction: CourtDirection.HORIZONTAL,
          status: 'EMPTY' as const,
        });
      }
    }

    await this.prisma.court.createMany({
      data: courts,
    });

    // Return session with courts
    return this.prisma.session.findUnique({
      where: { id: session.id },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        courts: {
          orderBy: { courtNumber: 'asc' },
        },
        players: {
          orderBy: { playerNumber: 'asc' },
          select: {
            id: true,
            playerNumber: true,
            joinCode: true,
            qrCodeData: true,
            name: true,
            isJoined: true,

            isGuest: true,
            user: {
              select: {
                image: true,
              },
            },
          },
        },
        _count: {
          select: {
            players: { where: { registrationStatus: 'APPROVED' as const } },
            courts: true,
          },
        },
      },
    });
  }

  async update(
    id: string,
    updateSessionDto: UpdateSessionDto,
    userId?: string,
    role?: string
  ) {
    const existingSession = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!existingSession) {
      throw new NotFoundException('Session not found');
    }

    // Authorization check: only session owner or admin can update
    if (userId && role !== 'ADMIN' && existingSession.hostId !== userId) {
      throw new ForbiddenException('Not authorized to modify this session');
    }

    // Validate requiredLevels if provided
    if (updateSessionDto.requiredLevels !== undefined) {
      if (!Array.isArray(updateSessionDto.requiredLevels)) {
        throw new BadRequestException('requiredLevels must be an array');
      }

      const validLevels = VALID_LEVELS;
      const invalidLevels = updateSessionDto.requiredLevels.filter(
        (level) => !validLevels.includes(level)
      );

      if (invalidLevels.length > 0) {
        throw new BadRequestException(
          `Invalid level values: ${invalidLevels.join(', ')}. Valid levels are: ${validLevels.join(', ')}`
        );
      }
    }

    const session = await this.prisma.session.update({
      where: { id },
      data: {
        name: updateSessionDto.name,
        numberOfCourts: updateSessionDto.numberOfCourts,
        sessionDuration: updateSessionDto.sessionDuration,
        maxPlayersPerCourt: updateSessionDto.maxPlayersPerCourt,
        requirePlayerInfo: updateSessionDto.requirePlayerInfo,
        allowGuestJoin: updateSessionDto.allowGuestJoin,
        allowNewPlayers: updateSessionDto.allowNewPlayers,
        requiredLevels:
          updateSessionDto.requiredLevels !== undefined
            ? updateSessionDto.requiredLevels
            : undefined,
        startTime: updateSessionDto.startTime
          ? new Date(updateSessionDto.startTime)
          : undefined,
        endTime: updateSessionDto.endTime
          ? new Date(updateSessionDto.endTime)
          : undefined,
        description: updateSessionDto.description,
        location: updateSessionDto.location,
        hostName: updateSessionDto.hostName,
        hostPhone: updateSessionDto.hostPhone,
        courtColor: updateSessionDto.courtColor,
        venue: updateSessionDto.venue
          ? {
              connectOrCreate: {
                where: { placeId: updateSessionDto.venue.placeId },
                create: {
                  placeId: updateSessionDto.venue.placeId,
                  name: updateSessionDto.venue.name,
                  address: updateSessionDto.venue.address,
                  lat: updateSessionDto.venue.lat,
                  lng: updateSessionDto.venue.lng,
                  district: updateSessionDto.venue.district,
                  city: updateSessionDto.venue.city,
                },
              },
            }
          : undefined,
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // If number of courts changed, adjust courts
    if (
      updateSessionDto.numberOfCourts !== undefined &&
      updateSessionDto.numberOfCourts !== existingSession.numberOfCourts
    ) {
      if (updateSessionDto.numberOfCourts > existingSession.numberOfCourts) {
        // Add new courts
        const newCourts: Array<{
          sessionId: string;
          courtNumber: number;
          courtName: null;
          direction: CourtDirection;
          status: 'EMPTY';
        }> = [];
        for (
          let i = existingSession.numberOfCourts + 1;
          i <= updateSessionDto.numberOfCourts;
          i++
        ) {
          newCourts.push({
            sessionId: id,
            courtNumber: i,
            courtName: null,
            direction: CourtDirection.HORIZONTAL,
            status: 'EMPTY' as const,
          });
        }

        await this.prisma.court.createMany({
          data: newCourts,
        });
      } else if (
        updateSessionDto.numberOfCourts < existingSession.numberOfCourts
      ) {
        // Remove excess courts (only if they're empty)
        await this.prisma.court.deleteMany({
          where: {
            sessionId: id,
            courtNumber: {
              gt: updateSessionDto.numberOfCourts,
            },
            status: 'EMPTY',
          },
        });
      }
    }

    this.sessionsGateway.notifySessionUpdate(id);
    return session;
  }

  async updateStatus(id: string, status: string) {
    const existingSession = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!existingSession) {
      throw new NotFoundException('Session not found');
    }

    const allowedStatuses = ['PREPARING', 'IN_PROGRESS', 'FINISHED'] as const;
    if (!allowedStatuses.includes(status as (typeof allowedStatuses)[number])) {
      throw new BadRequestException('Invalid session status');
    }
    const session = await this.prisma.session.update({
      where: { id },
      data: { status: status as (typeof allowedStatuses)[number] },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    this.sessionsGateway.notifySessionUpdate(id);
    return session;
  }

  async remove(id: string, userId?: string, role?: string) {
    const existingSession = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!existingSession) {
      throw new NotFoundException('Session not found');
    }

    // Authorization check: only session owner or admin can delete
    if (userId && role !== 'ADMIN' && existingSession.hostId !== userId) {
      throw new ForbiddenException('Not authorized to delete this session');
    }

    // Delete all players related to this session
    await this.prisma.player.deleteMany({
      where: { sessionId: id },
    });

    // Delete session (cascade will delete related courts, matches)
    await this.prisma.session.delete({
      where: { id },
    });

    return { message: 'Session and related players deleted successfully' };
  }

  async start(id: string) {
    const existingSession = await this.prisma.session.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            players: { where: { registrationStatus: 'APPROVED' as const } },
          },
        },
      },
    });

    if (!existingSession) {
      throw new NotFoundException('Session not found');
    }

    if (existingSession.status !== 'PREPARING') {
      throw new BadRequestException(
        'Session has already been started or finished'
      );
    }

    if (existingSession._count.players === 0) {
      throw new BadRequestException('Cannot start a session with no players');
    }

    const session = await this.prisma.session.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        startTime: new Date(),
      },
    });

    this.sessionsGateway.notifySessionUpdate(id);
    return session;
  }

  async end(id: string) {
    const sessionData = await this.prisma.session.findUnique({
      where: { id },
      include: {
        players: true,
        matches: {
          where: { status: 'IN_PROGRESS' },
          include: {
            players: true,
          },
        },
        courts: true,
      },
    });

    if (!sessionData) {
      throw new NotFoundException('Session not found');
    }

    if (sessionData.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Only in-progress sessions can be ended');
    }

    // Use transaction to ensure all operations succeed together
    const transactionResult = await this.prisma.$transaction(
      async (tx) => {
        // End all in-progress matches
        await tx.match.updateMany({
          where: {
            sessionId: id,
            status: 'IN_PROGRESS',
          },
          data: {
            status: 'FINISHED',
            endTime: new Date(),
          },
        });

        // Update players
        const playerUpdatePromises = sessionData.players.map(async (player) => {
          let updatedTotalWaitTime = player.totalWaitTime;

          if (player.status === 'WAITING' && player.currentWaitTime > 0) {
            updatedTotalWaitTime += player.currentWaitTime;
          }

          return tx.player.update({
            where: { id: player.id },
            data: {
              status: 'FINISHED',
              currentWaitTime: 0,
              totalWaitTime: updatedTotalWaitTime,
              currentCourtId: null,
            },
          });
        });

        await Promise.all(playerUpdatePromises);

        // Update all courts
        await tx.court.updateMany({
          where: {
            sessionId: id,
          },
          data: {
            status: 'EMPTY',
            currentMatchId: null,
          },
        });

        // End session
        const session = await tx.session.update({
          where: { id },
          data: {
            status: 'FINISHED',
            endTime: new Date(),
          },
        });

        // Generate session statistics
        const finalStats = await tx.player.findMany({
          where: {
            sessionId: id,
          },
          select: {
            id: true,
            playerNumber: true,
            name: true,
            matchesPlayed: true,
            totalWaitTime: true,
          },
          orderBy: {
            matchesPlayed: 'desc',
          },
        });

        return { session, statistics: { players: finalStats } };
      },
      {
        maxWait: 10000,
        timeout: 15000,
      }
    );

    this.sessionsGateway.notifySessionUpdate(id);
    return transactionResult;
  }

  async getStatus(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        players: {
          include: {
            user: {
              select: {
                image: true,
              },
            },
            currentCourt: {
              select: {
                courtNumber: true,
                courtName: true,
                currentMatch: {
                  select: {
                    id: true,
                    startTime: true,
                    players: {
                      include: {
                        player: {
                          select: {
                            id: true,
                            playerNumber: true,
                            name: true,
                          },
                        },
                      },
                      orderBy: { position: 'asc' },
                    },
                  },
                },
              },
            },
          },
          orderBy: [
            { status: 'desc' },
            { currentWaitTime: 'desc' },
            { playerNumber: 'asc' },
          ],
        },
        courts: {
          include: {
            currentMatch: {
              include: {
                players: {
                  include: {
                    player: {
                      select: {
                        id: true,
                        playerNumber: true,
                        name: true,
                        gender: true,
                        level: true,
                      },
                    },
                  },
                  orderBy: { position: 'asc' },
                },
              },
            },
          },
          orderBy: { courtNumber: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Calculate real-time statistics
    const stats = {
      totalPlayers: session.players.length,
      confirmedPlayers: session.players.filter((p) => p.confirmedByPlayer)
        .length,
      waitingPlayers: session.players.filter((p) => p.status === 'WAITING')
        .length,
      playingPlayers: session.players.filter((p) => p.status === 'PLAYING')
        .length,
      availableCourts: session.courts.filter((c) => c.status === 'EMPTY')
        .length,
      activeMatches: session.courts.filter((c) => c.currentMatch !== null)
        .length,
    };

    return {
      session,
      statistics: stats,
    };
  }

  async getPlayers(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return this.prisma.player.findMany({
      where: {
        sessionId: id,
      },
      include: {
        currentCourt: {
          select: {
            id: true,
            courtNumber: true,
            courtName: true,
          },
        },
        user: {
          select: {
            image: true,
          },
        },
      },
      orderBy: {
        playerNumber: 'asc',
      },
    });
  }

  async getCourts(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return this.prisma.court.findMany({
      where: {
        sessionId: id,
      },
      orderBy: {
        courtNumber: 'asc',
      },
      include: {
        currentPlayers: {
          select: {
            id: true,
            playerNumber: true,
            name: true,
            gender: true,
            level: true,
            levelDescription: true,
            status: true,
            requireConfirmInfo: true,
          },
        },
        currentMatch: {
          select: {
            id: true,
            startTime: true,
            status: true,
          },
        },
      },
    });
  }

  async getMatches(
    id: string,
    filters?: { playerId?: string; courtId?: string }
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Build where clause with optional filters
    const whereClause: Record<string, unknown> = {
      sessionId: id,
    };

    if (filters?.courtId) {
      (whereClause as { courtId?: string }).courtId = filters.courtId;
    }

    if (filters?.playerId) {
      (whereClause as { players?: object }).players = {
        some: {
          playerId: filters.playerId,
        },
      };
    }

    const matches = await this.prisma.match.findMany({
      where: whereClause,
      include: {
        players: {
          include: {
            player: {
              select: {
                id: true,
                playerNumber: true,
                name: true,
                courtPosition: true,
              },
            },
          },
          orderBy: {
            position: 'asc',
          },
        },
        court: {
          select: {
            id: true,
            courtNumber: true,
            courtName: true,
          },
        },
      },
      orderBy: {
        startTime: 'desc',
      },
    });

    // Return in the format expected by frontend
    return {
      matches,
      totalMatches: matches.length,
      activeMatches: matches.filter((m) => m.status === 'IN_PROGRESS').length,
      completedMatches: matches.filter((m) => m.status === 'FINISHED').length,
      filters: {
        playerId: filters?.playerId || null,
        courtId: filters?.courtId || null,
      },
    };
  }

  // ============ Phase 3 Missing Endpoints ============

  async autoAssign(id: string) {
    // Check if session exists and is in progress
    const session = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Cannot auto-assign players for a session that is not in progress'
      );
    }

    // Get empty courts
    const emptyCourts = await this.prisma.court.findMany({
      where: {
        sessionId: id,
        status: 'EMPTY',
      },
      orderBy: {
        courtNumber: 'asc',
      },
    });

    if (emptyCourts.length === 0) {
      throw new BadRequestException('No empty courts available');
    }

    // Get waiting players ordered by wait time (longest wait first)
    const waitingPlayers = await this.prisma.player.findMany({
      where: {
        sessionId: id,
        status: 'WAITING',
      },
      orderBy: {
        currentWaitTime: 'desc',
      },
    });

    // Check if we have enough players for at least one court
    if (waitingPlayers.length < 4) {
      throw new BadRequestException(
        'Not enough waiting players to start a match'
      );
    }

    // Calculate how many courts we can fill
    const courtsToFill = Math.min(
      emptyCourts.length,
      Math.floor(waitingPlayers.length / 4)
    );

    if (courtsToFill === 0) {
      throw new BadRequestException('Not enough players to fill any courts');
    }

    // Create matches for each court we can fill
    const createdMatches: Awaited<
      ReturnType<typeof this.prisma.match.create>
    >[] = [];

    for (let i = 0; i < courtsToFill; i++) {
      const court = emptyCourts[i];
      const players = waitingPlayers.slice(i * 4, i * 4 + 4);
      const playerIds = players.map((p) => p.id);

      // Create match in a transaction
      const result = await this.prisma.$transaction(
        async (tx) => {
          // 1. Create a new match
          const newMatch = await tx.match.create({
            data: {
              sessionId: id,
              courtId: court.id,
              status: 'IN_PROGRESS',
              startTime: new Date(),
            },
          });

          // 2. Create match players (positions 0-3)
          const matchPlayerPromises = playerIds.map((playerId, index) => {
            return tx.matchPlayer.create({
              data: {
                matchId: newMatch.id,
                playerId: playerId,
                position: index,
              },
            });
          });

          await Promise.all(matchPlayerPromises);

          // 3. Update court status
          await tx.court.update({
            where: { id: court.id },
            data: {
              status: 'IN_USE',
              currentMatchId: newMatch.id,
            },
          });

          // 4. Update player statuses
          await tx.player.updateMany({
            where: {
              id: { in: playerIds },
            },
            data: {
              status: 'PLAYING',
              currentCourtId: court.id,
              currentWaitTime: 0,
            },
          });

          return newMatch;
        },
        {
          maxWait: 10000,
          timeout: 15000,
        }
      );

      createdMatches.push(result);
    }

    return {
      matchesCreated: createdMatches.length,
      matches: createdMatches,
    };
  }

  async getWaitingQueue(id: string) {
    // Validate session exists
    const session = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Get waiting players sorted by wait time
    const waitingPlayers = await this.prisma.player.findMany({
      where: {
        sessionId: id,
        status: 'WAITING',
        confirmedByPlayer: true,
      },
      orderBy: [{ currentWaitTime: 'desc' }, { playerNumber: 'asc' }],
      select: {
        id: true,
        playerNumber: true,
        name: true,
        gender: true,
        level: true,
        currentWaitTime: true,
        totalWaitTime: true,
        matchesPlayed: true,
        user: {
          select: {
            image: true,
          },
        },
      },
    });

    return waitingPlayers;
  }

  async updateWaitTimes(
    id: string,
    data: {
      minutesToAdd?: number;
      resetType?: 'current' | 'total' | 'both';
      playerIds?: string[];
    }
  ) {
    const { minutesToAdd = 1, resetType, playerIds } = data;

    // Validate session exists
    const session = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Allow wait time updates for SCHEDULED, IN_PROGRESS sessions
    // Skip validation to allow updates even for FINISHED sessions for testing purposes
    // if (!['SCHEDULED', 'IN_PROGRESS'].includes(session.status)) {
    //   throw new BadRequestException('Session must be scheduled or in progress to update wait times');
    // }

    let result: { count: number };
    let updatedPlayers: Array<{
      id: string;
      playerNumber: number;
      name: string | null;
      gender: string | null;
      level: number | null;
      currentWaitTime: number;
      totalWaitTime: number;
      matchesPlayed: number;
    }>;

    // Handle reset functionality
    if (resetType && playerIds && Array.isArray(playerIds)) {
      let updateData: { currentWaitTime?: number; totalWaitTime?: number } = {};

      switch (resetType) {
        case 'current':
          updateData = { currentWaitTime: 0 };
          break;
        case 'total':
          updateData = { totalWaitTime: 0 };
          break;
        case 'both':
          updateData = { currentWaitTime: 0, totalWaitTime: 0 };
          break;
        default:
          updateData = { currentWaitTime: 0 };
      }

      result = await this.prisma.player.updateMany({
        where: {
          sessionId: id,
          id: { in: playerIds },
        },
        data: updateData,
      });

      updatedPlayers = await this.prisma.player.findMany({
        where: {
          sessionId: id,
          id: { in: playerIds },
        },
        orderBy: [{ currentWaitTime: 'desc' }, { playerNumber: 'asc' }],
      });
    } else {
      // Regular wait time update for all waiting players
      result = await this.prisma.player.updateMany({
        where: {
          sessionId: id,
          status: 'WAITING',
        },
        data: {
          currentWaitTime: {
            increment: minutesToAdd,
          },
          totalWaitTime: {
            increment: minutesToAdd,
          },
        },
      });

      // Get updated players for response
      updatedPlayers = await this.prisma.player.findMany({
        where: {
          sessionId: id,
          status: 'WAITING',
        },
        orderBy: [{ currentWaitTime: 'desc' }, { playerNumber: 'asc' }],
      });
    }

    return {
      updatedCount: result.count,
      players: updatedPlayers,
      minutesAdded: resetType ? 0 : minutesToAdd,
    };
  }

  async getWaitTimeStats(id: string) {
    // Validate session exists
    const session = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Get wait time statistics
    const waitingPlayersRaw = await this.prisma.player.findMany({
      where: {
        sessionId: id,
        status: 'WAITING',
      },
      orderBy: [{ waitingSince: 'asc' }, { playerNumber: 'asc' }], // Oldest waitingSince first = longest wait
    });

    // Calculate currentWaitTime dynamically from waitingSince
    const now = Date.now();
    const waitingPlayers = waitingPlayersRaw.map((p) => {
      const currentWaitTime = p.waitingSince
        ? Math.floor((now - new Date(p.waitingSince).getTime()) / 60000)
        : p.currentWaitTime; // Fallback to stored value for backward compatibility
      return { ...p, currentWaitTime };
    });

    // Sort by calculated wait time (descending)
    waitingPlayers.sort((a, b) => b.currentWaitTime - a.currentWaitTime);

    const playingPlayers = await this.prisma.player.findMany({
      where: {
        sessionId: id,
        status: 'PLAYING',
      },
      include: {
        currentCourt: {
          select: {
            courtNumber: true,
            courtName: true,
            currentMatch: {
              select: {
                startTime: true,
              },
            },
          },
        },
      },
    });

    const allPlayers = await this.prisma.player.findMany({
      where: { sessionId: id },
    });

    // Calculate statistics using dynamically computed wait times
    const stats = {
      totalPlayers: allPlayers.length,
      waitingPlayers: waitingPlayers.length,
      playingPlayers: playingPlayers.length,
      averageWaitTime:
        waitingPlayers.length > 0
          ? Math.round(
              waitingPlayers.reduce((sum, p) => sum + p.currentWaitTime, 0) /
                waitingPlayers.length
            )
          : 0,
      maxWaitTime:
        waitingPlayers.length > 0
          ? Math.max(...waitingPlayers.map((p) => p.currentWaitTime))
          : 0,
      minWaitTime:
        waitingPlayers.length > 0
          ? Math.min(...waitingPlayers.map((p) => p.currentWaitTime))
          : 0,
      totalWaitTime: allPlayers.reduce((sum, p) => sum + p.totalWaitTime, 0),
      averageTotalWaitTime:
        allPlayers.length > 0
          ? Math.round(
              allPlayers.reduce((sum, p) => sum + p.totalWaitTime, 0) /
                allPlayers.length
            )
          : 0,
    };

    return {
      stats,
      waitingPlayers,
      playingPlayers,
      lastUpdated: new Date().toISOString(),
    };
  }
}
