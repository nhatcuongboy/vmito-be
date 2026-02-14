import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateClubDto,
  UpdateClubDto,
  CreateClubFeeDto,
  BrowseClubsDto,
} from './dto';
import {
  Prisma,
  Gender,
  MemberRole,
  MemberStatus,
  JoinRequestStatus,
  ClubJoinPolicy,
  ClubStatus,
  Role,
} from '@prisma/client';
import { removeVietnameseTones } from '../common/utils/string.utils';

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================
  // Club Discovery (for Players)
  // ===========================================

  /**
   * Browse public clubs with search and pagination
   */
  async browsePublicClubs(query: BrowseClubsDto) {
    const { search, location, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where = {
      isPublic: true,
      status: ClubStatus.APPROVED,
      ...(search && {
        OR: [
          {
            searchTerms: {
              contains: removeVietnameseTones(search).toLowerCase(),
              mode: 'insensitive' as const,
            },
          },
          { name: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
      ...(location && {
        location: { contains: location, mode: 'insensitive' as const },
      }),
    };

    const [clubs, total] = await Promise.all([
      this.prisma.club.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sessionCount: 'desc' }, { createdAt: 'desc' }],
        include: {
          host: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          schedules: {
            orderBy: { dayOfWeek: 'asc' },
          },
          defaultVenue: {
            select: { id: true, name: true, address: true },
          },
          _count: {
            select: {
              members: {
                where: { status: MemberStatus.ACTIVE },
              },
            },
          },
        },
      }),
      this.prisma.club.count({ where }),
    ]);

    return {
      items: clubs.map((club) => ({
        id: club.id,
        name: club.name,
        description: club.description,
        color: club.color,
        image: club.image,
        location: club.location,
        joinPolicy: club.joinPolicy,
        maxMembers: club.maxMembers,
        memberCount: club._count.members,
        sessionCount: club.sessionCount,
        host: club.host,
        schedules: club.schedules,
        defaultVenue: club.defaultVenue,
        createdAt: club.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get club details by ID
   */
  async getClubDetails(id: string) {
    const club = await this.prisma.club.findUnique({
      where: { id },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        schedules: {
          orderBy: { dayOfWeek: 'asc' },
        },
        defaultVenue: {
          select: { id: true, name: true, address: true },
        },
        members: {
          where: { status: MemberStatus.ACTIVE },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                gender: true,
                level: true,
              },
            },
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
          take: 20,
        },
        announcements: {
          orderBy: [{ pinnedUntil: 'desc' }, { createdAt: 'desc' }],
          take: 5,
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: {
              where: { status: MemberStatus.ACTIVE },
            },
          },
        },
      },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    // Only show full details if club is public
    if (!club.isPublic) {
      return {
        id: club.id,
        name: club.name,
        description: club.description,
        color: club.color,
        image: club.image,
        isPublic: club.isPublic,
        joinPolicy: club.joinPolicy,
        message: 'This is a private club',
      };
    }

    return {
      id: club.id,
      name: club.name,
      description: club.description,
      color: club.color,
      image: club.image,
      location: club.location,
      isPublic: club.isPublic,
      joinPolicy: club.joinPolicy,
      maxMembers: club.maxMembers,
      memberCount: club._count.members,
      sessionCount: club.sessionCount,
      totalPlayersServed: club.totalPlayersServed,
      host: club.host,
      schedules: club.schedules,
      defaultVenue: club.defaultVenue,
      members: club.members.map((m) => ({
        id: m.id,
        role: m.role,
        createdAt: m.createdAt,
        user: m.user,
      })),
      announcements: club.announcements,
      createdAt: club.createdAt,
    };
  }

  /**
   * Request to join a club
   */
  async requestToJoinClub(clubId: string, userId: string, message?: string) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      include: {
        members: {
          where: { userId },
        },
        joinRequests: {
          where: { userId, status: JoinRequestStatus.PENDING },
        },
        _count: {
          select: { members: { where: { status: MemberStatus.ACTIVE } } },
        },
      },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    // Check if already a member
    if (club.members.length > 0) {
      throw new ConflictException('You are already a member of this club');
    }

    // Check if already has pending request
    if (club.joinRequests.length > 0) {
      throw new ConflictException('You already have a pending join request');
    }

    // Check max members
    if (club.maxMembers && club._count.members >= club.maxMembers) {
      throw new BadRequestException('This club has reached maximum capacity');
    }

    // Check join policy
    if (club.joinPolicy === ClubJoinPolicy.INVITATION_ONLY) {
      throw new BadRequestException('This club is invitation only');
    }

    // If OPEN, add directly as member
    if (club.joinPolicy === ClubJoinPolicy.OPEN) {
      const member = await this.prisma.clubMember.create({
        data: {
          clubId,
          userId,
          status: MemberStatus.ACTIVE,
        },
        include: {
          club: {
            select: { name: true },
          },
        },
      });

      return {
        status: 'joined',
        message: `You have successfully joined ${member.club.name}`,
      };
    }

    // APPROVAL_REQUIRED - create join request
    const joinRequest = await this.prisma.clubJoinRequest.create({
      data: {
        clubId,
        userId,
        message,
        status: JoinRequestStatus.PENDING,
      },
      include: {
        club: {
          select: { name: true },
        },
      },
    });

    return {
      status: 'pending',
      message: `Your request to join ${joinRequest.club.name} has been submitted`,
      requestId: joinRequest.id,
    };
  }

  /**
   * Leave a club
   */
  async leaveClub(clubId: string, userId: string) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    // Check if host is trying to leave
    if (club.hostId === userId) {
      throw new BadRequestException('Club owner cannot leave the club');
    }

    const member = await this.prisma.clubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
    });

    if (!member) {
      throw new NotFoundException('You are not a member of this club');
    }

    await this.prisma.clubMember.delete({
      where: { id: member.id },
    });

    return {
      message: 'You have successfully left the club',
    };
  }

  /**
   * Get clubs for a user
   */
  async getUserClubs(userId: string) {
    const memberships = await this.prisma.clubMember.findMany({
      where: {
        userId,
        status: MemberStatus.ACTIVE,
      },
      include: {
        club: {
          include: {
            host: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
            schedules: {
              orderBy: { dayOfWeek: 'asc' },
            },
            defaultVenue: {
              select: { id: true, name: true, address: true },
            },
            _count: {
              select: {
                members: {
                  where: { status: MemberStatus.ACTIVE },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.club.id,
      name: m.club.name,
      description: m.club.description,
      color: m.club.color,
      image: m.club.image,
      role: m.role,
      memberCount: m.club._count.members,
      host: m.club.host,
      schedules: m.club.schedules,
      defaultVenue: m.club.defaultVenue,
      joinedAt: m.createdAt,
    }));
  }

  /**
   * Get pending join requests for a user
   */
  async getUserJoinRequests(userId: string) {
    const requests = await this.prisma.clubJoinRequest.findMany({
      where: { userId },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            image: true,
            host: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((r) => ({
      id: r.id,
      status: r.status,
      message: r.message,
      response: r.response,
      club: r.club,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  // ===========================================
  // Club Management (for Hosts/Admins)
  // ===========================================

  /**
   * Get all clubs for a host
   */
  async getClubs(hostId: string) {
    const clubs = await this.prisma.club.findMany({
      where: { hostId },
      include: {
        _count: {
          select: { members: true },
        },
        schedules: {
          orderBy: { dayOfWeek: 'asc' },
        },
        defaultVenue: {
          select: { id: true, name: true, address: true },
        },
        feeConfigs: {
          where: {
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
          },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return clubs.map((club) => ({
      ...club,
      memberCount: club._count.members,
      currentMonthFee: club.feeConfigs[0] || null,
      _count: undefined,
      feeConfigs: undefined,
    }));
  }

  /**
   * Get a single club by ID for management
   */
  async getClub(clubId: string, hostId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, hostId },
      include: {
        _count: {
          select: { members: true },
        },
        schedules: {
          orderBy: { dayOfWeek: 'asc' },
        },
        defaultVenue: {
          select: { id: true, name: true, address: true },
        },
        feeConfigs: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
      },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    return {
      ...club,
      memberCount: club._count.members,
      _count: undefined,
    };
  }

  /**
   * Create a new club
   */
  async createClub(hostId: string, role: Role, dto: CreateClubDto) {
    // Check for duplicate name
    const existing = await this.prisma.club.findUnique({
      where: {
        hostId_name: { hostId, name: dto.name },
      },
    });

    if (existing) {
      throw new ConflictException('A club with this name already exists');
    }

    // Validate venue exists if provided
    if (dto.defaultVenueId) {
      const venue = await this.prisma.venue.findUnique({
        where: { id: dto.defaultVenueId },
      });
      if (!venue) {
        throw new NotFoundException('Venue not found');
      }
    }

    const { schedules, ...clubData } = dto;

    return this.prisma.club.create({
      data: {
        ...clubData,
        hostId,
        isPublic: dto.isPublic ?? true,
        status: role === Role.ADMIN ? ClubStatus.APPROVED : ClubStatus.PENDING,
        ...(schedules?.length && {
          schedules: {
            create: schedules.map((s) => ({
              dayOfWeek: s.dayOfWeek,
              startTime: s.startTime,
              endTime: s.endTime,
              notes: s.notes,
            })),
          },
        }),
        searchTerms: removeVietnameseTones(
          `${dto.name} ${dto.description || ''} ${dto.location || ''}`
        ).toLowerCase(),
      },
      include: {
        schedules: true,
        defaultVenue: {
          select: { id: true, name: true, address: true },
        },
      },
    });
  }

  /**
   * Update a club
   */
  async updateClub(clubId: string, hostId: string, dto: UpdateClubDto) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, hostId },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    // Check for duplicate name if name is being changed
    if (dto.name && dto.name !== club.name) {
      const existing = await this.prisma.club.findUnique({
        where: {
          hostId_name: { hostId, name: dto.name },
        },
      });

      if (existing) {
        throw new ConflictException('A club with this name already exists');
      }
    }

    // Validate venue exists if provided
    if (dto.defaultVenueId) {
      const venue = await this.prisma.venue.findUnique({
        where: { id: dto.defaultVenueId },
      });
      if (!venue) {
        throw new NotFoundException('Venue not found');
      }
    }

    const { schedules, ...clubData } = dto;

    // If schedules provided, delete old and create new in transaction
    if (schedules !== undefined) {
      return this.prisma.$transaction(async (tx) => {
        await tx.clubSchedule.deleteMany({ where: { clubId } });

        return tx.club.update({
          where: { id: clubId },
          data: {
            ...clubData,
            ...(schedules.length > 0 && {
              schedules: {
                create: schedules.map((s) => ({
                  dayOfWeek: s.dayOfWeek,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  notes: s.notes,
                })),
              },
            }),
            ...(clubData.name || clubData.description || clubData.location
              ? {
                  searchTerms: removeVietnameseTones(
                    `${clubData.name || ''} ${clubData.description || ''} ${
                      clubData.location || ''
                    }`
                  ).toLowerCase(),
                }
              : {}),
          },
          include: {
            schedules: true,
            defaultVenue: {
              select: { id: true, name: true, address: true },
            },
          },
        });
      });
    }

    return this.prisma.club.update({
      where: { id: clubId },
      data: {
        ...clubData,
        ...(clubData.name || clubData.description || clubData.location
          ? {
              searchTerms: removeVietnameseTones(
                `${clubData.name || ''} ${clubData.description || ''} ${
                  clubData.location || ''
                }`
              ).toLowerCase(),
            }
          : {}),
      },
      include: {
        schedules: true,
        defaultVenue: {
          select: { id: true, name: true, address: true },
        },
      },
    });
  }

  /**
   * Delete a club
   */
  async deleteClub(clubId: string, hostId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, hostId },
      include: {
        _count: {
          select: { members: true, players: true },
        },
      },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    // Check if club has active players in sessions
    if (club._count.players > 0) {
      throw new BadRequestException(
        'Cannot delete club with active players in sessions. Remove club member status from players first.'
      );
    }

    await this.prisma.club.delete({
      where: { id: clubId },
    });

    return { success: true };
  }

  // ===========================================
  // Member Management
  // ===========================================

  /**
   * Get all members of a club
   */
  async getClubMembers(clubId: string, hostId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, hostId },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    return this.prisma.clubMember.findMany({
      where: { clubId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            gender: true,
            image: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Add a user to a club
   */
  async addMemberToClub(clubId: string, userId: string, hostId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, hostId },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if already a member
    const existingMember = await this.prisma.clubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
    });

    if (existingMember) {
      throw new ConflictException('User is already a member of this club');
    }

    return this.prisma.clubMember.create({
      data: {
        clubId,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            gender: true,
            image: true,
          },
        },
      },
    });
  }

  /**
   * Remove a user from a club
   */
  async removeMemberFromClub(clubId: string, userId: string, hostId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, hostId },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    const member = await this.prisma.clubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found in this club');
    }

    await this.prisma.clubMember.delete({
      where: { id: member.id },
    });

    return { success: true };
  }

  /**
   * Update a member's role in a club
   */
  async updateMemberRole(
    clubId: string,
    userId: string,
    hostId: string,
    role: MemberRole
  ) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, hostId },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    const member = await this.prisma.clubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found in this club');
    }

    return this.prisma.clubMember.update({
      where: { id: member.id },
      data: { role },
    });
  }

  /**
   * Get all join requests for a club
   */
  async getJoinRequests(clubId: string, hostId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, hostId },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    return this.prisma.clubJoinRequest.findMany({
      where: { clubId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            gender: true,
            level: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Approve a join request
   */
  async approveJoinRequest(clubId: string, requestId: string, hostId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, hostId },
    });

    if (!club) {
      throw new NotFoundException('Club not found or unauthorized');
    }

    const request = await this.prisma.clubJoinRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.clubId !== clubId) {
      throw new NotFoundException('Join request not found');
    }

    if (request.status !== JoinRequestStatus.PENDING) {
      throw new BadRequestException('Request is already processed');
    }

    // Start transaction to approve request and add member
    return this.prisma.$transaction(async (tx) => {
      // 1. Update request status
      await tx.clubJoinRequest.update({
        where: { id: requestId },
        data: { status: JoinRequestStatus.APPROVED },
      });

      // 2. Check if already a member
      const existingMember = await tx.clubMember.findUnique({
        where: {
          clubId_userId: { clubId, userId: request.userId },
        },
      });

      if (existingMember) {
        return { status: 'already_member' };
      }

      // 3. Create member record
      return tx.clubMember.create({
        data: {
          clubId,
          userId: request.userId,
          role: MemberRole.MEMBER,
        },
      });
    });
  }

  /**
   * Reject a join request
   */
  async rejectJoinRequest(
    clubId: string,
    requestId: string,
    hostId: string,
    response?: string
  ) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, hostId },
    });

    if (!club) {
      throw new NotFoundException('Club not found or unauthorized');
    }

    const request = await this.prisma.clubJoinRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.clubId !== clubId) {
      throw new NotFoundException('Join request not found');
    }

    return this.prisma.clubJoinRequest.update({
      where: { id: requestId },
      data: {
        status: JoinRequestStatus.REJECTED,
        response,
      },
    });
  }

  /**
   * Search users for a club
   */
  async searchUsersForClub(hostId: string, query: string) {
    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
              { phone: { contains: query, mode: 'insensitive' } },
            ],
          },
          {
            playerRecords: {
              some: {
                session: {
                  hostId,
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        gender: true,
        image: true,
        phone: true,
        clubMemberships: {
          where: {
            club: {
              hostId,
            },
          },
          include: {
            club: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
      take: 20,
    });

    return users.map((user) => ({
      ...user,
      clubs: user.clubMemberships.map((m) => m.club),
      clubMemberships: undefined,
    }));
  }

  // ===========================================
  // Fee Configuration
  // ===========================================

  async getClubFees(clubId: string, hostId: string) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, hostId },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    return this.prisma.clubFeeConfig.findMany({
      where: { clubId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async getClubFeeForMonth(
    clubId: string,
    hostId: string,
    year: number,
    month: number
  ) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, hostId },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    return this.prisma.clubFeeConfig.findUnique({
      where: {
        clubId_month_year: { clubId, month, year },
      },
    });
  }

  async upsertClubFee(clubId: string, hostId: string, dto: CreateClubFeeDto) {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, hostId },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    if (!dto.maleFeePerSession && !dto.femaleFeePerSession) {
      throw new BadRequestException(
        'At least one per-session fee must be provided'
      );
    }

    return this.prisma.clubFeeConfig.upsert({
      where: {
        clubId_month_year: {
          clubId,
          month: dto.month,
          year: dto.year,
        },
      },
      create: {
        clubId,
        ...dto,
      },
      update: {
        maleFeeMonthly: dto.maleFeeMonthly,
        femaleFeeMonthly: dto.femaleFeeMonthly,
        maleFeePerSession: dto.maleFeePerSession,
        femaleFeePerSession: dto.femaleFeePerSession,
        notes: dto.notes,
      },
    });
  }

  async deleteClubFee(feeId: string, hostId: string) {
    const fee = await this.prisma.clubFeeConfig.findFirst({
      where: {
        id: feeId,
        club: { hostId },
      },
    });

    if (!fee) {
      throw new NotFoundException('Fee configuration not found');
    }

    await this.prisma.clubFeeConfig.delete({
      where: { id: feeId },
    });

    return { success: true };
  }

  // ===========================================
  // Helper Methods
  // ===========================================

  async getPerSessionFee(
    clubId: string,
    gender: Gender,
    sessionDate: Date
  ): Promise<number | null> {
    const month = sessionDate.getMonth() + 1;
    const year = sessionDate.getFullYear();

    const feeConfig = await this.prisma.clubFeeConfig.findUnique({
      where: {
        clubId_month_year: { clubId, month, year },
      },
    });

    if (!feeConfig) {
      return null;
    }

    if (gender === Gender.FEMALE) {
      return (
        feeConfig.femaleFeePerSession ?? feeConfig.maleFeePerSession ?? null
      );
    }

    return feeConfig.maleFeePerSession ?? feeConfig.femaleFeePerSession ?? null;
  }

  async getUserClubsForHost(userId: string, hostId: string) {
    const memberships = await this.prisma.clubMember.findMany({
      where: {
        userId,
        club: { hostId },
      },
      include: {
        club: {
          include: {
            feeConfigs: {
              where: {
                month: new Date().getMonth() + 1,
                year: new Date().getFullYear(),
              },
              take: 1,
            },
          },
        },
      },
    });

    return memberships.map((m) => ({
      ...m.club,
      currentMonthFee: m.club.feeConfigs[0] || null,
      feeConfigs: undefined,
    }));
  }

  async isUserInClub(userId: string, clubId: string): Promise<boolean> {
    const member = await this.prisma.clubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
    });

    return !!member;
  }

  async recordAttendance(
    sessionId: string,
    playerData: Array<{ userId?: string; clubId?: string }>,
    tx?: Prisma.TransactionClient
  ) {
    const prismaClient = tx || this.prisma;

    const clubPlayersMap = new Map<string, string[]>();
    for (const player of playerData) {
      if (player.userId && player.clubId) {
        const users = clubPlayersMap.get(player.clubId) || [];
        users.push(player.userId);
        clubPlayersMap.set(player.clubId, users);
      }
    }

    const now = new Date();

    for (const [clubId, userIds] of clubPlayersMap.entries()) {
      await prismaClient.clubSession.upsert({
        where: {
          clubId_sessionId: { clubId, sessionId },
        },
        create: {
          clubId,
          sessionId,
          attendanceCount: userIds.length,
        },
        update: {
          attendanceCount: userIds.length,
        },
      });

      for (const userId of userIds) {
        await prismaClient.clubMember.updateMany({
          where: { clubId, userId },
          data: {
            attendanceCount: { increment: 1 },
            lastAttendedAt: now,
          },
        });
      }

      await prismaClient.club.update({
        where: { id: clubId },
        data: {
          sessionCount: { increment: 1 },
          totalPlayersServed: { increment: userIds.length },
        },
      });
    }
  }
  // ===========================================
  // Admin Management Endpoints
  // ===========================================

  async getPendingClubs() {
    return this.prisma.club.findMany({
      where: { status: ClubStatus.PENDING },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveClub(id: string) {
    const club = await this.prisma.club.findUnique({
      where: { id },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    return this.prisma.club.update({
      where: { id },
      data: {
        status: ClubStatus.APPROVED,
        rejectionReason: null,
      },
    });
  }

  async rejectClub(id: string, reason: string) {
    const club = await this.prisma.club.findUnique({
      where: { id },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    return this.prisma.club.update({
      where: { id },
      data: {
        status: ClubStatus.REJECTED,
        rejectionReason: reason,
      },
    });
  }
}
