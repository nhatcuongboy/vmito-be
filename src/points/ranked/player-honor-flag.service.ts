import { BadRequestException, Injectable } from '@nestjs/common';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { PLAYER_HONOR_FLAG } from './ranked.constants';

/**
 * The player-honor switch (`PLAYER_HONOR_ENABLED`, toggled in the DB). Off
 * hides every player-facing ranked endpoint and stops drafting honor reviews,
 * while the ranked ledger keeps recording so a mid-period switch-on still
 * ranks the whole period. Admin endpoints ignore it.
 */
@Injectable()
export class PlayerHonorFlagService {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  isEnabled(): Promise<boolean> {
    return this.featureFlags.isEnabled(PLAYER_HONOR_FLAG);
  }

  async assertEnabled(): Promise<void> {
    if (!(await this.isEnabled())) {
      throw new BadRequestException('Tính năng vinh danh chưa mở');
    }
  }
}
