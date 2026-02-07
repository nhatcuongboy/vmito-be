import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto, UpdateGroupDto, CreateGroupFeeDto } from './dto';
import { Gender } from '@prisma/client';

@Injectable()
export class FixedMembersService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================
  // Group Management
  // ===========================================

  /**
   * Get all fixed member groups for a host
   */
  async getGroups(hostId: string) {
    const groups = await this.prisma.fixedMemberGroup.findMany({
      where: { hostId },
      include: {
        _count: {
          select: { members: true },
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

    return groups.map((group) => ({
      ...group,
      memberCount: group._count.members,
      currentMonthFee: group.feeConfigs[0] || null,
      _count: undefined,
      feeConfigs: undefined,
    }));
  }

  /**
   * Get a single group by ID
   */
  async getGroup(groupId: string, hostId: string) {
    const group = await this.prisma.fixedMemberGroup.findFirst({
      where: { id: groupId, hostId },
      include: {
        _count: {
          select: { members: true },
        },
        feeConfigs: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return {
      ...group,
      memberCount: group._count.members,
      _count: undefined,
    };
  }

  /**
   * Create a new fixed member group
   */
  async createGroup(hostId: string, dto: CreateGroupDto) {
    // Check for duplicate name
    const existing = await this.prisma.fixedMemberGroup.findUnique({
      where: {
        hostId_name: { hostId, name: dto.name },
      },
    });

    if (existing) {
      throw new ConflictException('A group with this name already exists');
    }

    return this.prisma.fixedMemberGroup.create({
      data: {
        hostId,
        name: dto.name,
        description: dto.description,
        color: dto.color,
      },
    });
  }

  /**
   * Update a group
   */
  async updateGroup(groupId: string, hostId: string, dto: UpdateGroupDto) {
    const group = await this.prisma.fixedMemberGroup.findFirst({
      where: { id: groupId, hostId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Check for duplicate name if name is being changed
    if (dto.name && dto.name !== group.name) {
      const existing = await this.prisma.fixedMemberGroup.findUnique({
        where: {
          hostId_name: { hostId, name: dto.name },
        },
      });

      if (existing) {
        throw new ConflictException('A group with this name already exists');
      }
    }

    return this.prisma.fixedMemberGroup.update({
      where: { id: groupId },
      data: dto,
    });
  }

  /**
   * Delete a group
   */
  async deleteGroup(groupId: string, hostId: string) {
    const group = await this.prisma.fixedMemberGroup.findFirst({
      where: { id: groupId, hostId },
      include: {
        _count: {
          select: { members: true, players: true },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Check if group has active players in sessions
    if (group._count.players > 0) {
      throw new BadRequestException(
        'Cannot delete group with active players in sessions. Remove fixed member status from players first.'
      );
    }

    await this.prisma.fixedMemberGroup.delete({
      where: { id: groupId },
    });

    return { success: true };
  }

  // ===========================================
  // Member Management
  // ===========================================

  /**
   * Get all members of a group
   */
  async getGroupMembers(groupId: string, hostId: string) {
    const group = await this.prisma.fixedMemberGroup.findFirst({
      where: { id: groupId, hostId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const members = await this.prisma.fixedMemberGroupMember.findMany({
      where: { groupId },
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

    return members;
  }

  /**
   * Add a user to a group
   */
  async addMemberToGroup(groupId: string, userId: string, hostId: string) {
    const group = await this.prisma.fixedMemberGroup.findFirst({
      where: { id: groupId, hostId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if already a member
    const existingMember = await this.prisma.fixedMemberGroupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
    });

    if (existingMember) {
      throw new ConflictException('User is already a member of this group');
    }

    return this.prisma.fixedMemberGroupMember.create({
      data: {
        groupId,
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
   * Remove a user from a group
   */
  async removeMemberFromGroup(groupId: string, userId: string, hostId: string) {
    const group = await this.prisma.fixedMemberGroup.findFirst({
      where: { id: groupId, hostId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const member = await this.prisma.fixedMemberGroupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found in this group');
    }

    await this.prisma.fixedMemberGroupMember.delete({
      where: { id: member.id },
    });

    return { success: true };
  }

  /**
   * Search users to add to a group (users who have played in host's sessions)
   */
  async searchUsersForGroup(hostId: string, query: string) {
    // Find users who have played in host's sessions
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
        fixedMemberGroupMemberships: {
          where: {
            group: {
              hostId,
            },
          },
          include: {
            group: {
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
      groups: user.fixedMemberGroupMemberships.map((m) => m.group),
      fixedMemberGroupMemberships: undefined,
    }));
  }

  // ===========================================
  // Fee Configuration
  // ===========================================

  /**
   * Get fee configurations for a group
   */
  async getGroupFees(groupId: string, hostId: string) {
    const group = await this.prisma.fixedMemberGroup.findFirst({
      where: { id: groupId, hostId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return this.prisma.fixedMemberGroupFeeConfig.findMany({
      where: { groupId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  /**
   * Get fee config for a specific month/year
   */
  async getGroupFeeForMonth(
    groupId: string,
    hostId: string,
    year: number,
    month: number
  ) {
    const group = await this.prisma.fixedMemberGroup.findFirst({
      where: { id: groupId, hostId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return this.prisma.fixedMemberGroupFeeConfig.findUnique({
      where: {
        groupId_month_year: { groupId, month, year },
      },
    });
  }

  /**
   * Create or update fee configuration for a group
   */
  async upsertGroupFee(
    groupId: string,
    hostId: string,
    dto: CreateGroupFeeDto
  ) {
    const group = await this.prisma.fixedMemberGroup.findFirst({
      where: { id: groupId, hostId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Validate that at least per-session fees are provided
    if (!dto.maleFeePerSession && !dto.femaleFeePerSession) {
      throw new BadRequestException(
        'At least one per-session fee (male or female) must be provided'
      );
    }

    return this.prisma.fixedMemberGroupFeeConfig.upsert({
      where: {
        groupId_month_year: {
          groupId,
          month: dto.month,
          year: dto.year,
        },
      },
      create: {
        groupId,
        month: dto.month,
        year: dto.year,
        maleFeeMonthly: dto.maleFeeMonthly,
        femaleFeeMonthly: dto.femaleFeeMonthly,
        maleFeePerSession: dto.maleFeePerSession,
        femaleFeePerSession: dto.femaleFeePerSession,
        notes: dto.notes,
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

  /**
   * Delete a fee configuration
   */
  async deleteGroupFee(feeId: string, hostId: string) {
    const fee = await this.prisma.fixedMemberGroupFeeConfig.findFirst({
      where: {
        id: feeId,
        group: { hostId },
      },
    });

    if (!fee) {
      throw new NotFoundException('Fee configuration not found');
    }

    await this.prisma.fixedMemberGroupFeeConfig.delete({
      where: { id: feeId },
    });

    return { success: true };
  }

  // ===========================================
  // Helper Methods for Fee Calculation
  // ===========================================

  /**
   * Get the per-session fee for a group and gender
   * Used when creating PaymentRecord for fixed members
   */
  async getPerSessionFee(
    groupId: string,
    gender: Gender,
    sessionDate: Date
  ): Promise<number | null> {
    const month = sessionDate.getMonth() + 1;
    const year = sessionDate.getFullYear();

    const feeConfig = await this.prisma.fixedMemberGroupFeeConfig.findUnique({
      where: {
        groupId_month_year: { groupId, month, year },
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

  /**
   * Get groups that a user belongs to (for a specific host)
   */
  async getUserGroupsForHost(userId: string, hostId: string) {
    const memberships = await this.prisma.fixedMemberGroupMember.findMany({
      where: {
        userId,
        group: { hostId },
      },
      include: {
        group: {
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
      ...m.group,
      currentMonthFee: m.group.feeConfigs[0] || null,
      feeConfigs: undefined,
    }));
  }

  /**
   * Check if a user is a member of a specific group
   */
  async isUserInGroup(userId: string, groupId: string): Promise<boolean> {
    const member = await this.prisma.fixedMemberGroupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
    });

    return !!member;
  }
}
