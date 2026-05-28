import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateLevelDescriptionsDto } from './dto/update-level-descriptions.dto';

const VALID_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

type LevelDescriptionResponse = {
  level: number;
  description: string;
  updatedAt?: Date;
};

@Injectable()
export class LevelDescriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<LevelDescriptionResponse[]> {
    const descriptions = await this.prisma.levelDescription.findMany({
      orderBy: { level: 'asc' },
    });

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

    return VALID_LEVELS.map(
      (level) => byLevel.get(level) ?? { level, description: '' }
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
