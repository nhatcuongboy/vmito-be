import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        tournament: {
          select: {
            id: true,
            name: true,
            hostId: true,
          },
        },
        registrations: {
          include: {
            player: true,
            pair: {
              include: {
                members: {
                  include: {
                    player: true,
                  },
                  orderBy: {
                    position: 'asc',
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        groups: {
          include: {
            _count: {
              select: {
                registrations: true,
                matches: true,
              },
            },
          },
          orderBy: {
            groupNumber: 'asc',
          },
        },
        matches: {
          include: {
            participants: true,
            court: true,
          },
          orderBy: {
            matchNumber: 'asc',
          },
        },
        _count: {
          select: {
            registrations: true,
            matches: true,
            groups: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, userId: string) {
    const existingCategory = await this.prisma.category.findUnique({
      where: { id },
      include: {
        tournament: {
          select: {
            hostId: true,
          },
        },
      },
    });

    if (!existingCategory) {
      throw new NotFoundException('Category not found');
    }

    if (existingCategory.tournament.hostId !== userId) {
      throw new ForbiddenException('You can only manage your own tournaments');
    }

    const updateData: any = {};

    if (dto.hasGroupStage !== undefined) {
      updateData.hasGroupStage = dto.hasGroupStage;
    }

    if (dto.averageMatchDuration !== undefined) {
      if (dto.averageMatchDuration < 0) {
        throw new BadRequestException('Average match duration must be non-negative');
      }
      updateData.averageMatchDuration = dto.averageMatchDuration;
    }

    if (dto.groupCount !== undefined) {
      if (dto.groupCount < 0) {
        throw new BadRequestException('Group count must be non-negative');
      }
      updateData.groupCount = dto.groupCount;
    }

    if (dto.winnersPerGroup !== undefined) {
      if (dto.winnersPerGroup < 0) {
        throw new BadRequestException('Winners per group must be non-negative');
      }
      updateData.winnersPerGroup = dto.winnersPerGroup;
    }

    if (dto.playersPerGroup !== undefined) {
      if (dto.playersPerGroup < 0) {
        throw new BadRequestException('Players per group must be non-negative');
      }
      updateData.playersPerGroup = dto.playersPerGroup;
    }

    if (dto.matchFormat !== undefined) {
      updateData.matchFormat = dto.matchFormat;
    }

    const category = await this.prisma.category.update({
      where: { id },
      data: updateData,
      include: {
        tournament: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            registrations: true,
            matches: true,
            groups: true,
          },
        },
      },
    });

    return category;
  }

  async remove(id: string, userId: string) {
    const existingCategory = await this.prisma.category.findUnique({
      where: { id },
      include: {
        tournament: {
          select: {
            hostId: true,
          },
        },
      },
    });

    if (!existingCategory) {
      throw new NotFoundException('Category not found');
    }

    if (existingCategory.tournament.hostId !== userId) {
      throw new ForbiddenException('You can only manage your own tournaments');
    }

    await this.prisma.category.delete({
      where: { id },
    });

    return { message: 'Category deleted successfully' };
  }

  // Get registrations for a category
  async getRegistrations(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const registrations = await this.prisma.categoryRegistration.findMany({
      where: { categoryId },
      include: {
        player: true,
        pair: {
          include: {
            members: {
              include: {
                player: true,
              },
              orderBy: {
                position: 'asc',
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return registrations;
  }

  // Get groups for a category
  async getGroups(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const groups = await this.prisma.categoryGroup.findMany({
      where: { categoryId },
      include: {
        matches: {
          orderBy: {
            matchNumber: 'asc',
          },
        },
        _count: {
          select: {
            registrations: true,
            matches: true,
          },
        },
      },
      orderBy: {
        groupNumber: 'asc',
      },
    });

    return groups;
  }

  // Get matches for a category
  async getMatches(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const matches = await this.prisma.categoryMatch.findMany({
      where: { categoryId },
      include: {
        participants: true,
        court: true,
        group: true,
      },
      orderBy: {
        matchNumber: 'asc',
      },
    });

    return matches;
  }

  // Get standings for a category (simplified version)
  async getStandings(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        groups: {
          orderBy: {
            groupNumber: 'asc',
          },
        },
        registrations: {
          include: {
            player: true,
            pair: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Simple standings calculation per group
    const groupStandings = await Promise.all(
      category.groups.map(async (group) => {
        // Get matches for this group
        const groupMatches = await this.prisma.categoryMatch.findMany({
          where: {
            groupId: group.id,
            status: 'FINISHED',
          },
          include: {
            participants: true,
          },
        });

        // Get registrations in this group through CategoryGroupRegistration
        const groupRegs = await this.prisma.categoryGroupRegistration.findMany({
          where: {
            groupId: group.id,
          },
          include: {
            categoryRegistration: {
              include: {
                player: true,
                pair: true,
              },
            },
          },
        });

        const standings = groupRegs.map((groupReg) => {
          const reg = groupReg.categoryRegistration;
          let wins = 0;
          let losses = 0;
          let matchesPlayed = 0;

          groupMatches.forEach((match) => {
            const isParticipant = match.participants.some(
              (p) => p.categoryRegistrationId === reg.id,
            );
            if (isParticipant) {
              matchesPlayed++;
              // Note: isWinner would need to be tracked differently
              // For now just count participation
            }
          });

          return {
            registrationId: reg.id,
            player: reg.player,
            pair: reg.pair,
            matchesPlayed,
            wins,
            losses,
            points: matchesPlayed, // Simple points based on matches played
          };
        });

        standings.sort((a, b) => b.points - a.points);

        return {
          groupId: group.id,
          groupNumber: group.groupNumber,
          groupName: group.name,
          standings,
        };
      }),
    );

    return {
      categoryId,
      categoryName: category.name,
      groupStandings,
    };
  }
}
