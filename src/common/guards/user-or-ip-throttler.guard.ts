import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit tracker keyed by the authenticated user when available, falling
 * back to the client IP for public/unauthenticated routes.
 *
 * Why: the default ThrottlerGuard buckets by IP. At a tournament venue every
 * referee, the host and spectators share a single public IP (NAT), so their
 * combined traffic — especially the high-frequency live-scoring PATCH calls —
 * drains one shared 100/min bucket and everyone gets 429s. Keying by user id
 * gives each logged-in person their own budget; public endpoints (login, etc.)
 * still throttle per IP for brute-force protection.
 *
 * NOTE: this relies on JwtAuthGuard running BEFORE the throttler guard so that
 * `req.user` is already populated (see APP_GUARD ordering in AppModule).
 */
@Injectable()
export class UserOrIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req.user?.userId;
    if (userId) return `user-${userId}`;
    const ip =
      Array.isArray(req.ips) && req.ips.length > 0 ? req.ips[0] : req.ip;
    return `ip-${ip}`;
  }
}
