import { Injectable, NotFoundException } from '@nestjs/common';
import { ViewTargetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ViewsService {
  constructor(private readonly prisma: PrismaService) {}

  async trackView(targetType: ViewTargetType, targetId: string) {
    await this.ensureTargetExists(targetType, targetId);

    const viewCount = await this.prisma.viewCount.upsert({
      where: {
        targetType_targetId: {
          targetType,
          targetId,
        },
      },
      create: {
        targetType,
        targetId,
        count: 1,
      },
      update: {
        count: {
          increment: 1,
        },
      },
      select: {
        count: true,
      },
    });

    return viewCount;
  }

  async getViewCount(targetType: ViewTargetType, targetId: string) {
    await this.ensureTargetExists(targetType, targetId);

    const viewCount = await this.prisma.viewCount.findUnique({
      where: {
        targetType_targetId: {
          targetType,
          targetId,
        },
      },
      select: {
        count: true,
      },
    });

    return { count: viewCount?.count ?? 0 };
  }

  private async ensureTargetExists(
    targetType: ViewTargetType,
    targetId: string
  ) {
    const exists = await this.targetExists(targetType, targetId);

    if (!exists) {
      throw new NotFoundException('View target not found');
    }
  }

  private async targetExists(targetType: ViewTargetType, targetId: string) {
    switch (targetType) {
      case ViewTargetType.VENUE:
        return Boolean(
          await this.prisma.venue.findUnique({
            where: { id: targetId },
            select: { id: true },
          })
        );
      case ViewTargetType.CLUB:
        return Boolean(
          await this.prisma.club.findUnique({
            where: { id: targetId },
            select: { id: true },
          })
        );
      case ViewTargetType.SESSION:
        return Boolean(
          await this.prisma.session.findUnique({
            where: { id: targetId },
            select: { id: true },
          })
        );
      default:
        return false;
    }
  }
}
