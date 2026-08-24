import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns every flag as a { KEY: boolean } map for easy client consumption. */
  async getAll(): Promise<Record<string, boolean>> {
    const flags = await this.prisma.featureFlag.findMany({
      where: { clientVisible: true },
      select: { key: true, enabled: true },
    });
    return Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
  }

  /** Reads a flag for backend behavior, including flags hidden from clients. */
  async isEnabled(key: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key },
      select: { enabled: true },
    });
    return flag?.enabled ?? false;
  }
}
