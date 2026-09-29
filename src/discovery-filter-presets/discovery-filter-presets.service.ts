import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DiscoveryFilterTab, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDiscoveryFilterPresetDto,
  UpdateDiscoveryFilterPresetDto,
} from './discovery-filter-presets.dto';
import { validateDiscoveryFilterConfig } from './discovery-filter-config';

@Injectable()
export class DiscoveryFilterPresetsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, tab: DiscoveryFilterTab) {
    return this.prisma.savedDiscoveryFilter.findMany({
      where: { userId, tab },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateDiscoveryFilterPresetDto) {
    const name = this.name(dto.name);
    const config = validateDiscoveryFilterConfig(dto.tab, dto.config);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const count = await tx.savedDiscoveryFilter.count({
              where: { userId, tab: dto.tab },
            });
            if (count >= 20)
              throw new BadRequestException({
                code: 'SAVED_FILTER_LIMIT',
                message: 'Saved filter limit reached',
              });
            return tx.savedDiscoveryFilter.create({
              data: {
                userId,
                tab: dto.tab,
                name,
                normalizedName: name.toLocaleLowerCase('en'),
                config,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 2
        )
          continue;
        this.handleUnique(error);
        throw error;
      }
    }
    throw new BadRequestException('Could not save filter');
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateDiscoveryFilterPresetDto
  ) {
    if (dto.name === null || dto.config === null) {
      throw new BadRequestException('Invalid saved filter update');
    }
    const existing = await this.prisma.savedDiscoveryFilter.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException('Saved filter not found');
    if (dto.name === undefined && dto.config === undefined) {
      throw new BadRequestException('Nothing to update');
    }
    const name = dto.name === undefined ? undefined : this.name(dto.name);
    const config =
      dto.config === undefined
        ? undefined
        : validateDiscoveryFilterConfig(existing.tab, dto.config);
    try {
      return await this.prisma.savedDiscoveryFilter.update({
        where: { id },
        data: {
          ...(name === undefined
            ? {}
            : {
                name,
                normalizedName: name.toLocaleLowerCase('en'),
              }),
          ...(config === undefined ? {} : { config }),
        },
      });
    } catch (error) {
      this.handleUnique(error);
      throw error;
    }
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.savedDiscoveryFilter.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0)
      throw new NotFoundException('Saved filter not found');
    return { deleted: true };
  }

  private name(value: string): string {
    const name = value.trim().replace(/\s+/g, ' ');
    if (name.length === 0 || name.length > 60) {
      throw new BadRequestException('Invalid saved filter name');
    }
    return name;
  }

  private handleUnique(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Saved filter name already exists');
    }
  }
}
