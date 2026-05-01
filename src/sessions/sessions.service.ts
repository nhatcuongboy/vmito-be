/// <reference types="multer" />
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
import {
  CourtDirection,
  ImageCategory,
  Prisma,
  SessionStatus,
} from '@prisma/client';
import { VALID_LEVELS } from '../common/constants/level.constants';

import { SessionsGateway } from './sessions.gateway';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ClubsService } from '../clubs/clubs.service';
import { UserImagesService } from '../user-images/user-images.service';
import { ScoringEngine } from './utils/scoring-engine';
import {
  generateSlug,
  removeVietnameseTones,
} from '../common/utils/string.utils';

@Injectable()
export class SessionsService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private sessionsGateway: SessionsGateway,
    private cloudinaryService: CloudinaryService,
    private clubsService: ClubsService,
    private userImagesService: UserImagesService
  ) {}

  private readonly STATUS_PRIORITY: Record<string, number> = {
    IN_PROGRESS: 0,
    PREPARING: 1,
    FINISHED: 2,
  };

  private buildOrderBy(
    sortBy?: string,
    sortOrder?: 'asc' | 'desc'
  ):
    | Prisma.SessionOrderByWithRelationInput
    | Prisma.SessionOrderByWithRelationInput[] {
    const order = sortOrder || 'asc';
    switch (sortBy) {
      case 'date':
        return { startTime: order };
      case 'created':
        return { createdAt: order };
      case 'price':
        return { feeConfig: { maleFee: order } };
      case 'status':
        // Status sort handled post-fetch (custom priority order)
        return { startTime: 'asc' };
      default:
        return { createdAt: 'desc' };
    }
  }

  private sortByStatus<
    T extends { status: string; startTime: Date | string | null },
  >(data: T[]): T[] {
    return data.sort((a, b) => {
      const orderA = this.STATUS_PRIORITY[a.status] ?? 3;
      const orderB = this.STATUS_PRIORITY[b.status] ?? 3;
      if (orderA !== orderB) return orderA - orderB;
      const dateA = a.startTime ? new Date(a.startTime).getTime() : 0;
      const dateB = b.startTime ? new Date(b.startTime).getTime() : 0;
      return dateA - dateB;
    });
  }

  async findAll(
    user?: { userId: string; role: string },
    filters?: {
      page?: number;
      limit?: number;
      hostId?: string;
      searchQuery?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      status?: SessionStatus;
      excludeStatus?: SessionStatus;
      excludeStatuses?: SessionStatus[];
      endTimeBefore?: string;
      endTimeAfter?: string;
    }
  ) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 12;
    const skip = (page - 1) * limit;

    const where: Prisma.SessionWhereInput = {};

    // If hostId is provided in filters, use it (could add security check here)
    if (filters?.hostId) {
      where.hostId = filters.hostId;
    } else if (user && user.role !== 'ADMIN') {
      // Default to filtering by current user if not admin
      where.hostId = user.userId;
    }

    if (filters?.searchQuery) {
      const searchTerm = removeVietnameseTones(
        filters.searchQuery
      ).toLowerCase();
      where.OR = [
        { searchTerms: { contains: searchTerm, mode: 'insensitive' } },
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { location: { contains: searchTerm, mode: 'insensitive' } },
        { venue: { name: { contains: searchTerm, mode: 'insensitive' } } },
        { venue: { address: { contains: searchTerm, mode: 'insensitive' } } },
      ];
    }

    if (filters?.status) {
      where.status = filters.status;
    } else if (filters?.excludeStatuses && filters.excludeStatuses.length > 0) {
      where.status = { notIn: filters.excludeStatuses };
    } else if (filters?.excludeStatus) {
      where.status = { not: filters.excludeStatus };
    }

    if (filters?.endTimeBefore) {
      where.endTime = { lt: new Date(filters.endTimeBefore) };
    } else if (filters?.endTimeAfter) {
      where.endTime = { gte: new Date(filters.endTimeAfter) };
    }

    const total = await this.prisma.session.count({ where });
    const isStatusSort = filters?.sortBy === 'status';
    const orderBy = this.buildOrderBy(filters?.sortBy, filters?.sortOrder);

    const data = await this.prisma.session.findMany({
      where,
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        venue: true,
        feeConfig: true,
        _count: {
          select: {
            players: { where: { registrationStatus: 'APPROVED' as const } },
            courts: true,
          },
        },
        courts: {
          orderBy: { courtNumber: 'asc' },
        },
      },
      orderBy,
      // For status sort, fetch all then sort + paginate in JS
      ...(isStatusSort ? {} : { skip, take: limit }),
    });

    if (isStatusSort) {
      const sorted = this.sortByStatus(data);
      return {
        data: sorted.slice(skip, skip + limit),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPublicSessions(
    hostId: string,
    filters?: {
      page?: number;
      limit?: number;
      status?: SessionStatus;
      excludeStatus?: SessionStatus;
      excludeStatuses?: SessionStatus[];
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ) {
    return this.findAll(undefined, { ...filters, hostId });
  }

  async findAvailable(filters?: {
    date?: string;
    level?: number;
    city?: string;
    district?: string;
    venueId?: string;
    minFee?: number;
    maxFee?: number;
    hasSlots?: boolean;
    minAvailableSlots?: number;
    searchQuery?: string;
    lat?: number;
    lng?: number;
    sortByDistance?: boolean;
    page?: number;
    limit?: number;
    hostId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 12;
    const skip = (page - 1) * limit;

    const where: Prisma.SessionWhereInput = {
      status: 'PREPARING', // Only show sessions that haven't started
      OR: [
        // Sessions with scheduledEndTime — use it as the deadline
        { scheduledEndTime: { gt: new Date() } },
        // Sessions without scheduledEndTime — fall back to endTime
        {
          scheduledEndTime: null,
          endTime: { gt: new Date() },
        },
      ],
    };

    // Initialize AND array if not present to avoid overwriting
    const andConditions: Prisma.SessionWhereInput[] = [];

    // Date filter
    if (filters?.date) {
      const date = new Date(filters.date);
      const startOfDay = new Date(date.setHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setHours(23, 59, 59, 999));

      andConditions.push({
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      });
    }

    // Level filter
    if (filters?.level) {
      andConditions.push({
        OR: [
          { requiredLevels: { has: Number(filters.level) } },
          { requiredLevels: { equals: [] } },
        ],
      });
    }

    // Area filters — support comma-separated values for multi-select
    if (filters?.city) {
      const cityList = filters.city
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      if (cityList.length === 1) {
        andConditions.push({
          OR: [
            {
              venue: {
                city: { contains: cityList[0], mode: 'insensitive' },
              },
            },
            { location: { contains: cityList[0], mode: 'insensitive' } },
          ],
        });
      } else {
        andConditions.push({
          OR: cityList.map((c) => ({
            OR: [
              { venue: { city: { contains: c, mode: 'insensitive' } } },
              { location: { contains: c, mode: 'insensitive' } },
            ],
          })),
        });
      }
    }

    if (filters?.district) {
      const districtList = filters.district
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);
      if (districtList.length === 1) {
        andConditions.push({
          OR: [
            {
              venue: {
                district: {
                  contains: districtList[0],
                  mode: 'insensitive',
                },
              },
            },
            {
              location: {
                contains: districtList[0],
                mode: 'insensitive',
              },
            },
          ],
        });
      } else {
        andConditions.push({
          OR: districtList.map((d) => ({
            OR: [
              { venue: { district: { contains: d, mode: 'insensitive' } } },
              { location: { contains: d, mode: 'insensitive' } },
            ],
          })),
        });
      }
    }

    // Venue filter
    if (filters?.venueId) {
      andConditions.push({
        venueId: filters.venueId,
      });
    }

    // Host filter
    if (filters?.hostId) {
      andConditions.push({
        hostId: filters.hostId,
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    // Fee range filter
    if (filters?.minFee !== undefined || filters?.maxFee !== undefined) {
      where.feeConfig = {
        ...(where.feeConfig as object),
        OR: [
          // Check male fee
          ...(filters?.minFee !== undefined && filters?.maxFee !== undefined
            ? [
                {
                  maleFee: {
                    gte: filters.minFee,
                    lte: filters.maxFee,
                  },
                },
              ]
            : filters?.minFee !== undefined
              ? [{ maleFee: { gte: filters.minFee } }]
              : [{ maleFee: { lte: filters.maxFee } }]),
          // Check female fee
          ...(filters?.minFee !== undefined && filters?.maxFee !== undefined
            ? [
                {
                  femaleFee: {
                    gte: filters.minFee,
                    lte: filters.maxFee,
                  },
                },
              ]
            : filters?.minFee !== undefined
              ? [{ femaleFee: { gte: filters.minFee } }]
              : [{ femaleFee: { lte: filters.maxFee } }]),
        ],
      };
    }

    // Search query - full text search across multiple fields
    if (filters?.searchQuery) {
      const searchTerm = removeVietnameseTones(
        filters.searchQuery
      ).toLowerCase();
      const searchConditions: Prisma.SessionWhereInput = {
        OR: [
          { searchTerms: { contains: searchTerm, mode: 'insensitive' } },
          // Fallback to old search fields for safety or if data not yet migrated
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { location: { contains: searchTerm, mode: 'insensitive' } },
          { host: { name: { contains: searchTerm, mode: 'insensitive' } } },
          {
            venue: {
              OR: [
                { name: { contains: searchTerm, mode: 'insensitive' } },
                { address: { contains: searchTerm, mode: 'insensitive' } },
                { district: { contains: searchTerm, mode: 'insensitive' } },
                { city: { contains: searchTerm, mode: 'insensitive' } },
              ],
            },
          },
        ],
      };

      if (where.AND) {
        (where.AND as Prisma.SessionWhereInput[]).push(searchConditions);
      } else {
        where.AND = [searchConditions];
      }
    }

    // Get total count (before pagination but after Prisma filters)
    const total = await this.prisma.session.count({ where });

    // Build orderBy - use sortBy param if provided, otherwise default to startTime asc
    const orderBy = filters?.sortByDistance
      ? { startTime: 'asc' as const } // distance sort is handled post-fetch
      : filters?.sortBy
        ? this.buildOrderBy(filters.sortBy, filters.sortOrder)
        : { startTime: 'asc' as const };

    // Fetch sessions
    let sessions = await this.prisma.session.findMany({
      where,
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        venue: true,
        feeConfig: true,
        _count: {
          select: {
            players: { where: { registrationStatus: 'APPROVED' as const } },
            courts: true,
          },
        },
        courts: {
          orderBy: { courtNumber: 'asc' },
        },
      },
      orderBy,
      skip,
      take: limit,
    });

    // Post-fetch filters (for complex calculations)

    // Filter by available slots
    if (
      filters?.hasSlots !== undefined ||
      filters?.minAvailableSlots !== undefined
    ) {
      sessions = sessions.filter((session) => {
        const maxPlayers = session.numberOfCourts * session.maxPlayersPerCourt;
        const approvedPlayers = session._count?.players || 0;
        const availableSlots = maxPlayers - approvedPlayers;

        if (filters.hasSlots !== undefined) {
          // If hasSlots is true, only show sessions with available slots
          // If hasSlots is false, show full sessions
          const hasAvailableSlots = availableSlots > 0;
          if (filters.hasSlots && !hasAvailableSlots) return false;
          if (!filters.hasSlots && hasAvailableSlots) return false;
        }

        if (filters.minAvailableSlots !== undefined) {
          if (availableSlots < filters.minAvailableSlots) return false;
        }

        return true;
      });
    }

    // Calculate distance and sort if geospatial params provided
    type SessionWithDistance = (typeof sessions)[number] & {
      distance?: number | null;
    };
    let sessionsToReturn: SessionWithDistance[] = sessions;
    if (
      filters?.lat !== undefined &&
      filters?.lng !== undefined &&
      filters?.sortByDistance
    ) {
      // Calculate distance for each session using Haversine formula
      sessionsToReturn = sessions
        .map((session) => {
          if (session.venue?.lat && session.venue?.lng) {
            const distance = this.calculateDistance(
              filters.lat!,
              filters.lng!,
              session.venue.lat,
              session.venue.lng
            );
            return { ...session, distance };
          }
          return { ...session, distance: null };
        })
        .sort((a, b) => {
          // Sort by distance (nulls last)
          if (a.distance === null && b.distance === null) return 0;
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
        });
    }

    return {
      data: sessionsToReturn,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Haversine formula to calculate distance between two lat/lng points in kilometers
  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 10) / 10; // Round to 1 decimal place
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  async findOne(identifier: string) {
    const session = await this.prisma.session.findFirst({
      where: {
        OR: [{ id: identifier }, { slug: identifier }],
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
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
                isClubMember: true,
                clubId: true,
                club: {
                  select: {
                    id: true,
                    name: true,
                    color: true,
                  },
                },
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
            isClubMember: true,
            clubId: true,

            club: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
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
        feeConfig: true,
        _count: {
          select: {
            players: {
              where: { registrationStatus: 'APPROVED' as const } as const,
            },
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

    const allPlayers = session.players.map((p) => ({
      ...p,
      // registrationStatus is already in the select
    }));

    const approvedPlayers = allPlayers.filter(
      (p) => p.registrationStatus === 'APPROVED'
    );
    const pendingPlayers = allPlayers.filter(
      (p) => p.registrationStatus === 'PENDING'
    );

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
      shuttlecock,
      coverPhoto,
      coverPhotoPublicId,
      defaultMatchType,
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

    // Calculate scheduled times
    const scheduledStart = startTime ? new Date(startTime) : new Date();
    const scheduledEnd = endTime
      ? new Date(endTime)
      : new Date(scheduledStart.getTime() + sessionDuration * 60 * 1000);
    // Grace period: 30 minutes after scheduled end
    const gracePeriodEnd = new Date(scheduledEnd.getTime() + 30 * 60 * 1000);

    // Create session
    const sessionSlug = `${generateSlug(name)}-${Math.random().toString(36).substring(2, 7)}`;
    const sessionSearchTerms = removeVietnameseTones(
      `${name} ${finalLocation || ''} ${hostName || ''} ${
        venue ? `${venue.name} ${venue.address}` : ''
      }`
    ).toLowerCase();
    const session = await this.prisma.session.create({
      data: {
        name,
        slug: sessionSlug,
        hostId,
        numberOfCourts: finalNumberOfCourts,
        sessionDuration,
        maxPlayersPerCourt,
        requirePlayerInfo,
        allowGuestJoin,
        allowNewPlayers,
        requiredLevels: requiredLevels || [],
        searchTerms: sessionSearchTerms,

        // Scheduled times (planned)
        scheduledStartTime: scheduledStart,
        scheduledEndTime: scheduledEnd,
        gracePeriodEnd,

        // Keep startTime/endTime for backward compat (display purposes)
        startTime: scheduledStart,
        endTime: scheduledEnd,

        status: 'PREPARING',
        description,
        location: finalLocation,
        hostName,
        hostPhone,
        venueId,
        courtColor: courtColor || '#179a3b',
        defaultMatchType: defaultMatchType || 'DOUBLES',
        shuttlecock,
        coverPhoto,
        coverPhotoPublicId,
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
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

    // Create fee configuration if provided
    if (createSessionDto.feeConfig) {
      await this.prisma.sessionFeeConfig.create({
        data: {
          sessionId: session.id,
          feeType: createSessionDto.feeConfig.feeType,
          maleFee: createSessionDto.feeConfig.maleFee ?? null,
          femaleFee: createSessionDto.feeConfig.femaleFee ?? null,
          notes: createSessionDto.feeConfig.notes ?? null,
        },
      });
    }

    // Return session with courts and feeConfig
    return this.prisma.session.findUnique({
      where: { id: session.id },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
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

            isClubMember: true,
            clubId: true,
            club: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
            isGuest: true,
            user: {
              select: {
                image: true,
              },
            },
          },
        },
        feeConfig: true,
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

    // Recompute searchTerms if any searchable field is being updated
    const needsSearchTermsUpdate =
      updateSessionDto.name !== undefined ||
      updateSessionDto.location !== undefined ||
      updateSessionDto.hostName !== undefined ||
      updateSessionDto.venue !== undefined;
    let updatedSearchTerms: string | undefined;
    if (needsSearchTermsUpdate) {
      const updatedName = updateSessionDto.name ?? existingSession.name;
      const updatedLocation =
        updateSessionDto.location ?? existingSession.location;
      const updatedHostName =
        updateSessionDto.hostName ?? existingSession.hostName;
      let venueNameAddress = '';
      if (updateSessionDto.venue) {
        venueNameAddress = `${updateSessionDto.venue.name} ${updateSessionDto.venue.address}`;
      } else if (existingSession.venueId) {
        const v = await this.prisma.venue.findUnique({
          where: { id: existingSession.venueId },
          select: { name: true, address: true },
        });
        if (v) venueNameAddress = `${v.name} ${v.address}`;
      }
      updatedSearchTerms = removeVietnameseTones(
        `${updatedName} ${updatedLocation || ''} ${updatedHostName || ''} ${venueNameAddress}`
      ).toLowerCase();
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
        searchTerms: updatedSearchTerms,
        hostPhone: updateSessionDto.hostPhone,
        courtColor: updateSessionDto.courtColor,
        defaultMatchType: updateSessionDto.defaultMatchType,
        shuttlecock: updateSessionDto.shuttlecock,
        coverPhoto: updateSessionDto.coverPhoto,
        coverPhotoPublicId: updateSessionDto.coverPhotoPublicId,
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
            image: true,
          },
        },
        feeConfig: true,
        venue: true,
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

    // Handle specific court updates (courtNumber, names, directions)
    // Match by positional index (ordered by current courtNumber) so renaming courtNumber works correctly.
    // Two-pass update to avoid unique constraint violations on (sessionId, courtNumber):
    //   Pass 1 – set courtNumber to a temporary large offset (index + 100000)
    //   Pass 2 – set courtNumber to the final desired value
    if (updateSessionDto.courts && Array.isArray(updateSessionDto.courts)) {
      const existingCourts = await this.prisma.court.findMany({
        where: { sessionId: id },
        orderBy: { courtNumber: 'asc' },
      });

      // Pass 1: assign temp courtNumbers to avoid conflicts
      for (let i = 0; i < updateSessionDto.courts.length; i++) {
        const existingCourt = existingCourts[i];
        if (!existingCourt) continue;
        await this.prisma.court.update({
          where: { id: existingCourt.id },
          data: { courtNumber: 100000 + i },
        });
      }

      // Pass 2: set final values
      for (let i = 0; i < updateSessionDto.courts.length; i++) {
        const courtConfig = updateSessionDto.courts[i];
        const existingCourt = existingCourts[i];
        if (!existingCourt) continue;
        await this.prisma.court.update({
          where: { id: existingCourt.id },
          data: {
            courtNumber: courtConfig.courtNumber,
            courtName: courtConfig.courtName ?? null,
            direction: courtConfig.direction,
          },
        });
      }
    }

    // Handle fee configuration updates
    if (updateSessionDto.feeConfig !== undefined) {
      const existingFeeConfig = await this.prisma.sessionFeeConfig.findUnique({
        where: { sessionId: id },
      });

      if (updateSessionDto.feeConfig === null) {
        // Delete fee config if explicitly set to null
        if (existingFeeConfig) {
          await this.prisma.sessionFeeConfig.delete({
            where: { sessionId: id },
          });
        }
      } else if (existingFeeConfig) {
        // Update existing fee config
        await this.prisma.sessionFeeConfig.update({
          where: { sessionId: id },
          data: {
            feeType: updateSessionDto.feeConfig.feeType,
            maleFee: updateSessionDto.feeConfig.maleFee ?? null,
            femaleFee: updateSessionDto.feeConfig.femaleFee ?? null,
            notes: updateSessionDto.feeConfig.notes ?? null,
          },
        });
      } else {
        // Create new fee config
        await this.prisma.sessionFeeConfig.create({
          data: {
            sessionId: id,
            feeType: updateSessionDto.feeConfig.feeType,
            maleFee: updateSessionDto.feeConfig.maleFee ?? null,
            femaleFee: updateSessionDto.feeConfig.femaleFee ?? null,
            notes: updateSessionDto.feeConfig.notes ?? null,
          },
        });
      }
    }

    this.sessionsGateway.notifySessionUpdate(id);
    return session;
  }

  async updateBulkStatus(sessionIds: string[], status: string) {
    const allowedStatuses: SessionStatus[] = [
      SessionStatus.PREPARING,
      SessionStatus.IN_PROGRESS,
      SessionStatus.FINISHED,
      SessionStatus.CANCELLED,
    ];
    if (!allowedStatuses.includes(status as SessionStatus)) {
      throw new BadRequestException('Invalid session status');
    }

    const { count } = await this.prisma.session.updateMany({
      where: { id: { in: sessionIds } },
      data: { status: status as SessionStatus },
    });

    sessionIds.forEach((id) => this.sessionsGateway.notifySessionUpdate(id));

    return { count };
  }

  async updateStatus(id: string, status: string) {
    const existingSession = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!existingSession) {
      throw new NotFoundException('Session not found');
    }

    const allowedStatuses: SessionStatus[] = [
      SessionStatus.PREPARING,
      SessionStatus.IN_PROGRESS,
      SessionStatus.FINISHED,
      SessionStatus.CANCELLED,
    ];
    if (!allowedStatuses.includes(status as SessionStatus)) {
      throw new BadRequestException('Invalid session status');
    }
    const session = await this.prisma.session.update({
      where: { id },
      data: { status: status as SessionStatus },
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

  /**
   * Cancel a PREPARING session. Notifies all approved players.
   */
  async cancel(id: string, userId: string, role: string) {
    const existingSession = await this.prisma.session.findUnique({
      where: { id },
      include: {
        players: {
          where: { registrationStatus: 'APPROVED' },
          select: { id: true, userId: true, name: true },
        },
      },
    });

    if (!existingSession) {
      throw new NotFoundException('Session not found');
    }

    // Authorization check
    if (role !== 'ADMIN' && existingSession.hostId !== userId) {
      throw new ForbiddenException('Not authorized to cancel this session');
    }

    if (existingSession.status !== 'PREPARING') {
      throw new BadRequestException(
        'Only sessions in PREPARING status can be cancelled'
      );
    }

    const session = await this.prisma.session.update({
      where: { id },
      data: {
        status: SessionStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    // Notify session room
    this.sessionsGateway.notifySessionUpdate(id);

    return session;
  }

  async bulkDelete(sessionIds: string[], userId?: string, role?: string) {
    if (!sessionIds || sessionIds.length === 0) {
      return { count: 0 };
    }

    // If not admin, verify ownership of all sessions
    if (role !== 'ADMIN') {
      const notOwned = await this.prisma.session.count({
        where: {
          id: { in: sessionIds },
          hostId: { not: userId },
        },
      });
      if (notOwned > 0) {
        throw new ForbiddenException(
          'Not authorized to delete one or more sessions'
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.player.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.session.deleteMany({ where: { id: { in: sessionIds } } });
    });

    return { count: sessionIds.length };
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

  /**
   * Auto-start a session at its scheduled start time.
   * Uses scheduledStartTime as the actual startTime (not now),
   * so the session ends at the originally planned scheduledEndTime.
   * Called by the scheduler — does not throw for 0 players.
   */
  async autoStart(id: string) {
    const existingSession = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!existingSession) {
      throw new NotFoundException('Session not found');
    }

    if (existingSession.status !== 'PREPARING') {
      throw new BadRequestException(
        'Session has already been started or finished'
      );
    }

    const now = new Date();

    // Use the original scheduled times so the session ends exactly as planned
    const startTime = existingSession.scheduledStartTime ?? now;
    const endTime =
      existingSession.scheduledEndTime ??
      new Date(
        startTime.getTime() + existingSession.sessionDuration * 60 * 1000
      );
    const gracePeriodEnd = new Date(endTime.getTime() + 30 * 60 * 1000);

    const session = await this.prisma.session.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        startTime,
        endTime,
        scheduledEndTime: endTime,
        gracePeriodEnd,
        autoStartedAt: now,
        // Reset end-warning flag for the new cycle
        endWarningSentAt: null,
      },
    });

    this.sessionsGateway.notifySessionUpdate(id);
    return session;
  }

  /**
   * Manual early start — called when the host taps "Start" before scheduledStartTime.
   * Uses `now` as the actual startTime, so endTime shifts forward by sessionDuration.
   * If called at or after scheduledStartTime, the session may already be IN_PROGRESS
   * due to auto-start, in which case this throws "already started".
   */
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

    let computedEndTime = existingSession.endTime;
    if (!computedEndTime && existingSession.startTime) {
      computedEndTime = new Date(existingSession.startTime);
      computedEndTime.setMinutes(
        computedEndTime.getMinutes() + existingSession.sessionDuration
      );
    }

    if (computedEndTime && computedEndTime < new Date()) {
      throw new BadRequestException(
        'Cannot start a session that has already passed its end time'
      );
    }

    if (existingSession._count.players === 0) {
      throw new BadRequestException('Cannot start a session with no players');
    }

    const now = new Date();
    // Recalculate end time and grace period based on actual start
    const actualEndTime = new Date(
      now.getTime() + existingSession.sessionDuration * 60 * 1000
    );
    const gracePeriodEnd = new Date(actualEndTime.getTime() + 30 * 60 * 1000);

    const session = await this.prisma.session.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        startTime: now,
        endTime: actualEndTime,
        scheduledEndTime: actualEndTime,
        gracePeriodEnd,
        // Reset notification flags for fresh cycle
        endWarningSentAt: null,
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

    // This method is used as the "End & Finalize" action.
    // It works during both normal IN_PROGRESS and overtime (past scheduledEndTime).

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

        // Record club attendance
        await this.clubsService.recordAttendance(
          id,
          sessionData.players.map((p) => ({
            userId: p.userId || undefined,
            clubId: p.clubId || undefined,
          })),
          tx
        );

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
        club: {
          select: {
            id: true,
            name: true,
            color: true,
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

  async uploadCoverPhoto(
    sessionId: string,
    file: Express.Multer.File,
    userId?: string,
    role?: string
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Authorization check: only session owner or admin can upload cover photo
    if (userId && role !== 'ADMIN' && session.hostId !== userId) {
      throw new ForbiddenException('Not authorized to modify this session');
    }

    // Delete old cover photo if exists
    if (session.coverPhotoPublicId) {
      await this.cloudinaryService.deleteImage(session.coverPhotoPublicId);
    }

    // Upload new cover photo
    const uploadResult =
      await this.cloudinaryService.uploadSessionCoverPhoto(file);

    // Save to user's image gallery
    if (userId) {
      await this.userImagesService.createFromUploadResult(
        userId,
        uploadResult,
        ImageCategory.SESSION_COVER,
        file.originalname
      );
    }

    // Update session with new cover photo
    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        coverPhoto: uploadResult.secureUrl,
        coverPhotoPublicId: uploadResult.publicId,
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
        feeConfig: true,
      },
    });

    return updatedSession;
  }

  async deleteCoverPhoto(sessionId: string, userId?: string, role?: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Authorization check: only session owner or admin can delete cover photo
    if (userId && role !== 'ADMIN' && session.hostId !== userId) {
      throw new ForbiddenException('Not authorized to modify this session');
    }

    // Delete cover photo from Cloudinary if exists
    if (session.coverPhotoPublicId) {
      await this.cloudinaryService.deleteImage(session.coverPhotoPublicId);
    }

    // Update session to remove cover photo
    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        coverPhoto: null,
        coverPhotoPublicId: null,
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
        feeConfig: true,
      },
    });

    return updatedSession;
  }

  async updateSessionImages(
    sessionId: string,
    images: string[],
    imagePublicIds: string[],
    userId?: string,
    role?: string
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (userId && role !== 'ADMIN' && session.hostId !== userId) {
      throw new ForbiddenException('Not authorized to modify this session');
    }

    if (images.length > 5) {
      throw new BadRequestException('Maximum 5 images allowed per session');
    }

    if (images.length !== imagePublicIds.length) {
      throw new BadRequestException(
        'Images and imagePublicIds must have the same length'
      );
    }

    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        images,
        imagePublicIds,
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
        feeConfig: true,
      },
    });

    return updatedSession;
  }

  async updateSessionBanner(
    sessionId: string,
    coverPhoto: string,
    coverPhotoPublicId: string,
    userId?: string,
    role?: string
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (userId && role !== 'ADMIN' && session.hostId !== userId) {
      throw new ForbiddenException('Not authorized to modify this session');
    }

    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        coverPhoto,
        coverPhotoPublicId,
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
        feeConfig: true,
      },
    });

    return updatedSession;
  }

  /**
   * Bulk session creation - creates multiple sessions at once
   */
  async createBulkSessions(
    bulkDto: {
      mode: string;
      baseSession: CreateSessionDto;
      specificDates?: { dates: string[] };
      recurringWeekdays?: {
        weekdays: number[];
        numberOfWeeks: number;
        startDate?: string;
      };
    },
    hostId: string
  ) {
    const { mode, baseSession, specificDates, recurringWeekdays } = bulkDto;

    // Validate mode and configs
    if (mode === 'specific-dates' && !specificDates?.dates?.length) {
      throw new BadRequestException(
        'specificDates.dates is required for specific-dates mode'
      );
    }

    if (
      mode === 'recurring-weekdays' &&
      (!recurringWeekdays?.weekdays?.length ||
        !recurringWeekdays?.numberOfWeeks)
    ) {
      throw new BadRequestException(
        'recurringWeekdays.weekdays and numberOfWeeks are required for recurring-weekdays mode'
      );
    }

    // Use Prisma transaction for all-or-nothing semantics
    try {
      const sessions = await this.prisma.$transaction(async (tx) => {
        const createdSessions: Awaited<
          ReturnType<typeof this.createSessionInternal>
        >[] = [];

        if (mode === 'single') {
          // Single session creation
          const session = await this.createSessionInternal(
            baseSession,
            hostId,
            tx
          );
          createdSessions.push(session);
        } else if (mode === 'specific-dates' && specificDates) {
          // Create base session first
          const baseSessionCreated = await this.createSessionInternal(
            baseSession,
            hostId,
            tx
          );
          createdSessions.push(baseSessionCreated);

          // Clone to specific dates
          for (const dateStr of specificDates.dates) {
            const clonedSessionDto = this.cloneSessionWithNewDate(
              baseSession,
              new Date(dateStr)
            );
            const clonedSession = await this.createSessionInternal(
              clonedSessionDto,
              hostId,
              tx
            );
            createdSessions.push(clonedSession);
          }
        } else if (mode === 'recurring-weekdays' && recurringWeekdays) {
          // Create base session first
          const baseSessionCreated = await this.createSessionInternal(
            baseSession,
            hostId,
            tx
          );
          createdSessions.push(baseSessionCreated);

          // Calculate recurring dates
          const startDate = recurringWeekdays.startDate
            ? new Date(recurringWeekdays.startDate)
            : baseSession.startTime
              ? new Date(baseSession.startTime)
              : new Date();

          const recurringDates = this.calculateRecurringDates(
            startDate,
            recurringWeekdays.weekdays,
            recurringWeekdays.numberOfWeeks
          );

          // Filter out base session date to avoid duplicates
          const baseSessionDate = baseSession.startTime
            ? new Date(baseSession.startTime)
            : new Date();
          const baseDateStr = this.formatDateOnly(baseSessionDate);

          const uniqueDates = recurringDates.filter(
            (date) => this.formatDateOnly(date) !== baseDateStr
          );

          // Create sessions for each unique date
          for (const date of uniqueDates) {
            const clonedSessionDto = this.cloneSessionWithNewDate(
              baseSession,
              date
            );
            const clonedSession = await this.createSessionInternal(
              clonedSessionDto,
              hostId,
              tx
            );
            createdSessions.push(clonedSession);
          }
        }

        return createdSessions;
      });

      return {
        success: true,
        sessionsCreated: sessions.length,
        sessions,
        errors: [],
      };
    } catch (error) {
      console.error('Bulk session creation failed:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(
        `Failed to create bulk sessions: ${errorMessage}`
      );
    }
  }

  /**
   * Internal method to create a single session within a transaction
   */
  private async createSessionInternal(
    createSessionDto: CreateSessionDto,
    hostId: string,
    tx?: Prisma.TransactionClient
  ) {
    const prismaClient = tx || this.prisma;

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
      shuttlecock,
      coverPhoto,
      coverPhotoPublicId,
      defaultMatchType,
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
    const host = await prismaClient.user.findUnique({
      where: { id: hostId },
    });

    if (!host) {
      throw new NotFoundException('Host not found');
    }

    // Handle Venue Logic
    let venueId: string | undefined;
    let finalLocation = location;

    if (venue) {
      let existingVenue = await prismaClient.venue.findUnique({
        where: { placeId: venue.placeId },
      });

      if (!existingVenue) {
        existingVenue = await prismaClient.venue.create({
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
      if (!finalLocation) {
        finalLocation = venue.address;
      }
    }

    // Create session
    const internalSearchTerms = removeVietnameseTones(
      `${name} ${finalLocation || ''} ${hostName || ''} ${
        venue ? `${venue.name} ${venue.address}` : ''
      }`
    ).toLowerCase();
    const session = await prismaClient.session.create({
      data: {
        name,
        slug: `${generateSlug(name)}-${Math.random().toString(36).substring(2, 7)}`,
        hostId,
        numberOfCourts: finalNumberOfCourts,
        sessionDuration,
        maxPlayersPerCourt,
        requirePlayerInfo,
        allowGuestJoin,
        allowNewPlayers,
        requiredLevels: requiredLevels || [],
        searchTerms: internalSearchTerms,
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
        defaultMatchType: defaultMatchType || 'DOUBLES',
        shuttlecock,
        coverPhoto,
        coverPhotoPublicId,
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
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

    await prismaClient.court.createMany({
      data: courts,
    });

    // Create fee configuration if provided
    if (createSessionDto.feeConfig) {
      await prismaClient.sessionFeeConfig.create({
        data: {
          sessionId: session.id,
          feeType: createSessionDto.feeConfig.feeType,
          maleFee: createSessionDto.feeConfig.maleFee ?? null,
          femaleFee: createSessionDto.feeConfig.femaleFee ?? null,
          notes: createSessionDto.feeConfig.notes ?? null,
        },
      });
    }

    // Return session with full details
    return prismaClient.session.findUnique({
      where: { id: session.id },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        courts: {
          orderBy: { courtNumber: 'asc' },
        },
        venue: true,
        feeConfig: true,
        _count: {
          select: {
            players: { where: { registrationStatus: 'APPROVED' as const } },
            courts: true,
          },
        },
      },
    });
  }

  /**
   * Clone session data with a new date while preserving time
   */
  private cloneSessionWithNewDate(
    baseSession: CreateSessionDto,
    newDate: Date
  ): CreateSessionDto {
    const startTime = baseSession.startTime
      ? new Date(baseSession.startTime)
      : new Date();
    const endTime = baseSession.endTime
      ? new Date(baseSession.endTime)
      : new Date();

    // Preserve time (hours:minutes) from base session
    const newStartTime = new Date(newDate);
    newStartTime.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);

    const newEndTime = new Date(newDate);
    newEndTime.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);

    return {
      ...baseSession,
      startTime: newStartTime.toISOString(),
      endTime: newEndTime.toISOString(),
    };
  }

  /**
   * Calculate recurring dates based on weekdays and number of weeks
   */
  private calculateRecurringDates(
    startDate: Date,
    weekdays: number[],
    numberOfWeeks: number
  ): Date[] {
    const dates: Date[] = [];

    for (let week = 0; week < numberOfWeeks; week++) {
      for (const weekday of weekdays) {
        const date = new Date(startDate);

        // Calculate days to add
        const currentWeekday = startDate.getDay();
        let daysToAdd = (weekday - currentWeekday + 7) % 7;
        daysToAdd += week * 7;

        date.setDate(startDate.getDate() + daysToAdd);
        dates.push(date);
      }
    }

    return dates;
  }

  /**
   * Format date to YYYY-MM-DD for comparison
   */
  private formatDateOnly(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Get suggested sessions for a user based on level, location, and play history
   */
  async getSuggestions(
    userId: string,
    query: {
      lat?: number;
      lng?: number;
      radius?: number;
      page?: number;
      limit?: number;
    }
  ) {
    const radius = query.radius || 15;
    const page = query.page || 1;
    const limit = query.limit || 12;

    // 1. Get user profile
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, level: true, gender: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // 2. Get user's play history (last 20 sessions)
    const recentPlayers = await this.prisma.player.findMany({
      where: {
        userId,
        registrationStatus: 'APPROVED',
        session: { status: { in: ['FINISHED', 'IN_PROGRESS'] } },
      },
      include: {
        session: {
          select: { venueId: true, startTime: true },
        },
      },
      orderBy: { joinedAt: 'desc' },
      take: 20,
    });

    // Extract patterns from history
    const venueFrequency: Record<string, number> = {};
    const dayFrequency: Record<number, number> = {};
    const hourFrequency: Record<number, number> = {};

    for (const p of recentPlayers) {
      if (p.session.venueId) {
        venueFrequency[p.session.venueId] =
          (venueFrequency[p.session.venueId] || 0) + 1;
      }
      if (p.session.startTime) {
        const day = p.session.startTime.getDay();
        const hour = p.session.startTime.getHours();
        dayFrequency[day] = (dayFrequency[day] || 0) + 1;
        hourFrequency[hour] = (hourFrequency[hour] || 0) + 1;
      }
    }

    const topVenueIds = Object.entries(venueFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

    const maxDayFreq = Math.max(...Object.values(dayFrequency), 1);
    const maxHourFreq = Math.max(...Object.values(hourFrequency), 1);
    const hasHistory = recentPlayers.length > 0;

    // 3. Get candidate sessions
    const now = new Date();
    const candidates = await this.prisma.session.findMany({
      where: {
        status: 'PREPARING',
        endTime: { gt: now },
        allowNewPlayers: true,
        // Exclude sessions user already joined
        NOT: {
          players: { some: { userId } },
        },
      },
      include: {
        host: {
          select: { id: true, name: true, email: true, image: true },
        },
        venue: true,
        feeConfig: true,
        _count: {
          select: {
            players: { where: { registrationStatus: 'APPROVED' } },
            courts: true,
          },
        },
        courts: {
          orderBy: { courtNumber: 'asc' },
        },
      },
    });

    // 4. Score each session
    const scored = candidates.map((session) => {
      const matchReasons: string[] = [];
      let totalScore = 0;

      // Level match (weight: 0.30)
      let levelScore = 0.5;
      if (!session.requiredLevels || session.requiredLevels.length === 0) {
        levelScore = 1.0;
        matchReasons.push('level_match');
      } else if (user.level && session.requiredLevels.includes(user.level)) {
        levelScore = 1.0;
        matchReasons.push('level_match');
      } else if (
        user.level &&
        session.requiredLevels.some((l) => Math.abs(l - user.level!) <= 1)
      ) {
        levelScore = 0.5;
      } else {
        levelScore = 0.0;
      }
      totalScore += 0.3 * levelScore;

      // Distance (weight: 0.25)
      let distance: number | null = null;
      let distanceScore = 0.5;
      if (
        query.lat !== undefined &&
        query.lng !== undefined &&
        session.venue?.lat &&
        session.venue?.lng
      ) {
        distance = this.calculateDistance(
          query.lat,
          query.lng,
          session.venue.lat,
          session.venue.lng
        );
        distanceScore = Math.max(0, 1 - distance / radius);
        if (distanceScore > 0.5) {
          matchReasons.push('nearby');
        }
      }
      totalScore += 0.25 * distanceScore;

      // Schedule match (weight: 0.20)
      let scheduleScore = hasHistory ? 0 : 0.5;
      if (hasHistory && session.startTime) {
        const sessionDay = session.startTime.getDay();
        const sessionHour = session.startTime.getHours();
        const dayScore = (dayFrequency[sessionDay] || 0) / maxDayFreq;
        const hourScore = (hourFrequency[sessionHour] || 0) / maxHourFreq;
        scheduleScore = dayScore * 0.5 + hourScore * 0.5;
        if (scheduleScore > 0.5) {
          matchReasons.push('preferred_time');
        }
      }
      totalScore += 0.2 * scheduleScore;

      // Venue familiarity (weight: 0.15)
      let venueScore = hasHistory ? 0.3 : 0.5;
      if (session.venueId && topVenueIds.includes(session.venueId)) {
        venueScore = 1.0;
        matchReasons.push('familiar_venue');
      }
      totalScore += 0.15 * venueScore;

      // Available slots (weight: 0.10)
      const maxPlayers = session.numberOfCourts * session.maxPlayersPerCourt;
      const approvedPlayers = session._count?.players || 0;
      const availableSlots = maxPlayers - approvedPlayers;
      const slotsScore = Math.min(1, availableSlots / 4);
      if (availableSlots > 0) {
        matchReasons.push('available_slots');
      }
      totalScore += 0.1 * slotsScore;

      return {
        ...session,
        score: Math.round(totalScore * 100) / 100,
        distance,
        matchReasons,
      };
    });

    // 5. Sort by score descending, paginate
    scored.sort((a, b) => b.score - a.score);
    const total = scored.length;
    const paginated = scored.slice((page - 1) * limit, page * limit);

    return {
      data: paginated,
      pagination: { page, limit, total },
    };
  }

  /**
   * Get session-based recommendations for a specific session
   * @param sessionId - Current session being viewed
   * @param userId - Optional user ID for personalization
   * @param options - Pagination options
   * @returns Paginated recommendations with scores and match reasons
   */
  async getSessionRecommendations(
    sessionId: string,
    userId?: string,
    options?: {
      page?: number;
      limit?: number;
    }
  ) {
    const page = options?.page || 1;
    const limit = options?.limit || 12;
    const skip = (page - 1) * limit;

    // 1. Fetch current session with relations
    const currentSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        venue: true,
        host: {
          select: { id: true, name: true, email: true, image: true },
        },
        feeConfig: true,
      },
    });

    if (!currentSession) {
      throw new NotFoundException('Session not found');
    }

    // 2. Build where clause for candidate sessions
    const now = new Date();
    const where: Prisma.SessionWhereInput = {
      status: 'PREPARING',
      endTime: { gt: now },
      allowNewPlayers: true,
      // Exclude current session
      NOT: {
        id: sessionId,
      },
    };

    // Exclude sessions where user already joined (if userId provided)
    if (userId) {
      where.NOT = {
        OR: [
          { id: sessionId },
          { players: { some: { userId, registrationStatus: 'APPROVED' } } },
        ],
      };
    }

    // 3. Fetch candidate sessions (limit to 100 for performance)
    const candidates = await this.prisma.session.findMany({
      where,
      include: {
        host: {
          select: { id: true, name: true, email: true, image: true },
        },
        venue: true,
        feeConfig: true,
        _count: {
          select: {
            players: { where: { registrationStatus: 'APPROVED' } },
            courts: true,
          },
        },
        courts: {
          orderBy: { courtNumber: 'asc' },
        },
      },
      take: 100, // Limit candidate evaluation
    });

    // 4. Score each candidate using ScoringEngine
    const scored = candidates.map((candidate) => {
      // Calculate distance if both sessions have venue coordinates
      let distance: number | null = null;
      if (
        currentSession.venue?.lat &&
        currentSession.venue?.lng &&
        candidate.venue?.lat &&
        candidate.venue?.lng
      ) {
        distance = ScoringEngine.calculateDistance(
          currentSession.venue.lat,
          currentSession.venue.lng,
          candidate.venue.lat,
          candidate.venue.lng
        );
      }

      // Calculate approved player count
      const approvedPlayerCount = candidate._count?.players || 0;

      // Calculate relevance score
      const scoreResult = ScoringEngine.calculateRelevanceScore(
        currentSession,
        candidate,
        distance,
        approvedPlayerCount
      );

      // Generate match reasons
      const matchReasons = ScoringEngine.getMatchReasons(
        currentSession,
        candidate,
        scoreResult,
        distance
      );

      // Calculate available slots
      const maxSlots = candidate.numberOfCourts * candidate.maxPlayersPerCourt;
      const availableSlots = maxSlots - approvedPlayerCount;

      return {
        id: candidate.id,
        slug: candidate.slug,
        name: candidate.name,
        startTime: candidate.startTime?.toISOString() || null,
        endTime: candidate.endTime?.toISOString() || null,
        coverPhoto: candidate.coverPhoto,
        venue: candidate.venue
          ? {
              id: candidate.venue.id,
              name: candidate.venue.name,
              address: candidate.venue.address,
              city: candidate.venue.city || '',
              district: candidate.venue.district || '',
              lat: candidate.venue.lat || 0,
              lng: candidate.venue.lng || 0,
            }
          : null,
        host: candidate.host,
        feeConfig: candidate.feeConfig
          ? {
              feeType: candidate.feeConfig.feeType,
              maleFee: candidate.feeConfig.maleFee,
              femaleFee: candidate.feeConfig.femaleFee,
            }
          : null,
        availableSlots,
        maxSlots,
        requiredLevels: candidate.requiredLevels,
        relevanceScore: scoreResult.total,
        matchReasons,
        distance,
      };
    });

    // 5. Check if fallback is needed (all scores below 0.3 threshold)
    const hasGoodMatches = scored.some((s) => s.relevanceScore >= 0.3);

    if (!hasGoodMatches && scored.length === 0) {
      // Use fallback recommendations
      const fallbackResults = await this.getFallbackRecommendations(
        currentSession,
        { page, limit }
      );

      return {
        data: fallbackResults,
        pagination: {
          page,
          limit,
          total: fallbackResults.length,
          totalPages: Math.ceil(fallbackResults.length / limit),
        },
        meta: {
          currentSessionId: sessionId,
          isFallback: true,
        },
      };
    }

    // 6. Sort by relevance score descending, then start time ascending
    scored.sort((a, b) => {
      if (a.relevanceScore !== b.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      // Equal scores: sort by start time ascending
      const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
      const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
      return timeA - timeB;
    });

    // 7. Apply pagination
    const total = scored.length;
    const paginated = scored.slice(skip, skip + limit);

    return {
      data: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      meta: {
        currentSessionId: sessionId,
        isFallback: false,
      },
    };
  }

  /**
   * Get fallback recommendations (popular sessions) when no good matches found
   * @param currentSession - Current session being viewed
   * @param options - Pagination options
   * @returns Popular sessions in same city
   */
  private async getFallbackRecommendations(
    currentSession: any,
    options?: { page?: number; limit?: number }
  ) {
    const page = options?.page || 1;
    const limit = options?.limit || 12;
    const skip = (page - 1) * limit;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Query popular sessions (highest player count in last 7 days)
    const where: Prisma.SessionWhereInput = {
      status: 'PREPARING',
      endTime: { gt: now },
      allowNewPlayers: true,
      NOT: {
        id: currentSession.id,
      },
      // Same city as current session
      venue: currentSession.venue?.city
        ? { city: currentSession.venue.city }
        : undefined,
    };

    const popularSessions = await this.prisma.session.findMany({
      where,
      include: {
        host: {
          select: { id: true, name: true, email: true, image: true },
        },
        venue: true,
        feeConfig: true,
        _count: {
          select: {
            players: { where: { registrationStatus: 'APPROVED' } },
            courts: true,
          },
        },
        players: {
          where: {
            registrationStatus: 'APPROVED',
            createdAt: { gte: sevenDaysAgo },
          },
          select: { id: true },
        },
      },
      take: 50, // Get top 50 popular sessions
    });

    // Sort by player count in last 7 days (descending)
    const sorted = popularSessions
      .map((session) => {
        const playerCountLast7Days = session.players.length;
        const approvedPlayerCount = session._count?.players || 0;
        const maxSlots = session.numberOfCourts * session.maxPlayersPerCourt;
        const availableSlots = maxSlots - approvedPlayerCount;

        return {
          id: session.id,
          slug: session.slug,
          name: session.name,
          startTime: session.startTime?.toISOString() || null,
          endTime: session.endTime?.toISOString() || null,
          coverPhoto: session.coverPhoto,
          venue: session.venue
            ? {
                id: session.venue.id,
                name: session.venue.name,
                address: session.venue.address,
                city: session.venue.city || '',
                district: session.venue.district || '',
                lat: session.venue.lat || 0,
                lng: session.venue.lng || 0,
              }
            : null,
          host: session.host,
          feeConfig: session.feeConfig
            ? {
                feeType: session.feeConfig.feeType,
                maleFee: session.feeConfig.maleFee,
                femaleFee: session.feeConfig.femaleFee,
              }
            : null,
          availableSlots,
          maxSlots,
          requiredLevels: session.requiredLevels,
          relevanceScore: 0, // No relevance score for fallback
          matchReasons: [], // No match reasons for fallback
          distance: null,
          playerCountLast7Days,
        };
      })
      .sort((a, b) => b.playerCountLast7Days - a.playerCountLast7Days);

    // Apply pagination
    return sorted.slice(skip, skip + limit);
  }
}
