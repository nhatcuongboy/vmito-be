import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateLevelDescriptionsDto } from './dto/update-level-descriptions.dto';
import {
  LEVEL_DEFINITIONS,
  VALID_LEVELS,
  isValidLevel,
} from '../common/constants/level.constants';

type LevelDescriptionResponse = {
  level: number;
  description: string;
  updatedAt?: Date;
};

type LevelDefinitionResponse = {
  id: number;
  code: string;
  shortLabel: string;
  sortOrder: number;
  active: boolean;
};

@Injectable()
export class LevelDescriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findDefinitions(): Promise<LevelDefinitionResponse[]> {
    const definitions = await this.prisma.levelDefinition.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    if (definitions.length > 0) {
      return definitions;
    }

    return LEVEL_DEFINITIONS.map((level) => ({
      id: level.id,
      code: level.code,
      shortLabel: level.shortLabel,
      sortOrder: level.sortOrder,
      active: true,
    }));
  }

  async findAll(): Promise<LevelDescriptionResponse[]> {
    const [definitions, descriptions] = await Promise.all([
      this.findDefinitions(),
      this.prisma.levelDescription.findMany(),
    ]);

    const byLevel = new Map(
      descriptions.map((item) => [
        item.level,
        {
          level: item.level,
          description: item.description,
          updatedAt: item.updatedAt,
        },
      ])
    );

    return definitions
      .filter((level) => level.active)
      .map(
        (level) => byLevel.get(level.id) ?? { level: level.id, description: '' }
      );
  }

  async updateAll(
    dto: UpdateLevelDescriptionsDto
  ): Promise<LevelDescriptionResponse[]> {
    const byLevel = new Map<number, string>();

    for (const item of dto.descriptions) {
      if (byLevel.has(item.level)) {
        throw new BadRequestException(`Duplicate level: ${item.level}`);
      }
      if (!isValidLevel(item.level)) {
        throw new BadRequestException(
          `Invalid level: ${item.level}. Valid levels are: ${VALID_LEVELS.join(', ')}`
        );
      }
      byLevel.set(item.level, item.description.trim());
    }

    const missingLevels = VALID_LEVELS.filter((level) => !byLevel.has(level));
    if (missingLevels.length > 0 || byLevel.size !== VALID_LEVELS.length) {
      throw new BadRequestException(
        `Descriptions must include exactly levels ${VALID_LEVELS.join(', ')}`
      );
    }

    await this.prisma.$transaction(
      VALID_LEVELS.map((level) =>
        this.prisma.levelDescription.upsert({
          where: { level },
          create: {
            level,
            description: byLevel.get(level) ?? '',
          },
          update: {
            description: byLevel.get(level) ?? '',
          },
        })
      )
    );

    return this.findAll();
  }
}
