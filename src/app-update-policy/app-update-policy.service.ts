import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AppUpdatePolicyResponse {
  enabled: boolean;
  minVersion: string;
}

@Injectable()
export class AppUpdatePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Missing row means "no policy": the app treats it as nothing to enforce,
   * so a platform that was never seeded can't lock anyone out.
   */
  async getForPlatform(platform: string): Promise<AppUpdatePolicyResponse> {
    const policy = await this.prisma.appUpdatePolicy.findUnique({
      where: { platform },
      select: { enabled: true, minVersion: true },
    });
    return policy ?? { enabled: false, minVersion: '0.0.0' };
  }
}
