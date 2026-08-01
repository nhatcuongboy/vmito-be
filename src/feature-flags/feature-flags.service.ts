import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns every flag as a { KEY: boolean } map for easy client consumption. */
  async getAll(): Promise<Record<string, boolean>> {
    const flags = await this.prisma.featureFlag.findMany({
      select: { key: true, enabled: true },
    });
    return Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
  }
}
