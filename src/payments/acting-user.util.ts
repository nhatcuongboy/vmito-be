import { Role } from '@prisma/client';

/**
 * Resolve whose data a payments endpoint should read.
 *
 * Only an ADMIN may look at another user's data, via the optional `override`
 * id. For everyone else the override is ignored and their own id is used, so
 * a regular user can never read someone else's transactions by passing it.
 */
export const resolveActingUserId = (
  user: { userId: string; role?: string },
  override?: string
): string => (user.role === Role.ADMIN && override ? override : user.userId);
