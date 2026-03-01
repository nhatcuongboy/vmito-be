import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PLAYER_VIP_ENABLED } from '../../common/constants/feature-flags';

/**
 * PlayerVipGuard - Allows PLAYER role to access HOST-restricted endpoints
 * when the PLAYER_VIP_ENABLED flag is set to true.
 *
 * Usage: Place AFTER RolesGuard. When PLAYER_VIP_ENABLED is true,
 * this guard ensures PLAYER users pass role checks that include HOST.
 *
 * This guard should be used in combination with updating @Roles()
 * to include Role.PLAYER on endpoints that should be accessible
 * to VIP players.
 */
@Injectable()
export class PlayerVipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { role: Role } }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // HOST and ADMIN always pass
    if (user.role === Role.HOST || user.role === Role.ADMIN) {
      return true;
    }

    // PLAYER only passes when VIP flag is enabled
    if (user.role === Role.PLAYER) {
      if (!PLAYER_VIP_ENABLED) {
        throw new ForbiddenException(
          'VIP features are not enabled for PLAYER role'
        );
      }
      return true;
    }

    throw new ForbiddenException('Access denied');
  }
}
