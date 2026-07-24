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
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { userId?: string } | undefined;
    const userId = user?.userId;
    if (userId) return Promise.resolve(`user-${userId}`);
    const ips = req.ips as string[] | undefined;
    const ip = Array.isArray(ips) && ips.length > 0 ? ips[0] : (req.ip as string);
    return Promise.resolve(`ip-${ip}`);
  }
}
