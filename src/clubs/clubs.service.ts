import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrowseClubsDto } from '../fixed-members/dto';
import {
  ClubJoinPolicy,
  JoinRequestStatus,
  MemberStatus,
} from '@prisma/client';

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Browse public clubs with search and pagination
   */
  async browsePublicClubs(query: BrowseClubsDto) {
    const { search, location, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where = {
      isPublic: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
      ...(location && {
        location: { contains: location, mode: 'insensitive' as const },
      }),
    };

    const [clubs, total] = await Promise.all([
      this.prisma.fixedMemberGroup.findMany({
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
          _count: {
            select: {
              members: {
                where: { status: MemberStatus.ACTIVE },
              },
            },
          },
        },
      }),
      this.prisma.fixedMemberGroup.count({ where }),
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
    const club = await this.prisma.fixedMemberGroup.findUnique({
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
    const club = await this.prisma.fixedMemberGroup.findUnique({
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
      const member = await this.prisma.fixedMemberGroupMember.create({
        data: {
          groupId: clubId,
          userId,
          status: MemberStatus.ACTIVE,
        },
        include: {
          group: {
            select: { name: true },
          },
        },
      });

      return {
        status: 'joined',
        message: `You have successfully joined ${member.group.name}`,
      };
    }

    // APPROVAL_REQUIRED - create join request
    const joinRequest = await this.prisma.clubJoinRequest.create({
      data: {
        groupId: clubId,
        userId,
        message,
        status: JoinRequestStatus.PENDING,
      },
      include: {
        group: {
          select: { name: true },
        },
      },
    });

    return {
      status: 'pending',
      message: `Your request to join ${joinRequest.group.name} has been submitted`,
      requestId: joinRequest.id,
    };
  }

  /**
   * Leave a club
   */
  async leaveClub(clubId: string, userId: string) {
    const club = await this.prisma.fixedMemberGroup.findUnique({
      where: { id: clubId },
    });

    if (!club) {
      throw new NotFoundException('Club not found');
    }

    // Check if host is trying to leave
    if (club.hostId === userId) {
      throw new BadRequestException('Club owner cannot leave the club');
    }

    const member = await this.prisma.fixedMemberGroupMember.findUnique({
      where: {
        groupId_userId: { groupId: clubId, userId },
      },
    });

    if (!member) {
      throw new NotFoundException('You are not a member of this club');
    }

    await this.prisma.fixedMemberGroupMember.delete({
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
    const memberships = await this.prisma.fixedMemberGroupMember.findMany({
      where: {
        userId,
        status: MemberStatus.ACTIVE,
      },
      include: {
        group: {
          include: {
            host: {
              select: {
                id: true,
                name: true,
                image: true,
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
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      description: m.group.description,
      color: m.group.color,
      image: m.group.image,
      role: m.role,
      memberCount: m.group._count.members,
      host: m.group.host,
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
        group: {
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
      club: r.group,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }
}
