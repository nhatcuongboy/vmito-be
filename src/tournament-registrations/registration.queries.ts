import { Prisma, TournamentRegistrationStatus } from '@prisma/client';

type Db = Prisma.TransactionClient;

export const REQUEST_INCLUDE = {
  user: { select: { id: true, name: true, image: true } },
  category: {
    select: {
      id: true,
      name: true,
      type: true,
      registrationMode: true,
      teamSize: true,
    },
  },
} satisfies Prisma.TournamentRegistrationRequestInclude;

/** Everyone a request would register: requester first, then Vmito partners. */
export function requestUserIds(request: {
  userId: string;
  partnerUserIds: string[];
}): string[] {
  return [request.userId, ...request.partnerUserIds];
}

/** Which of `userIds` already play in the category (as a player or pair member). */
export async function findRegisteredUserIds(
  db: Db,
  categoryId: string,
  userIds: string[]
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const registrations = await db.categoryRegistration.findMany({
    where: {
      categoryId,
      OR: [
        { player: { userId: { in: userIds } } },
        {
          pair: {
            members: { some: { player: { userId: { in: userIds } } } },
          },
        },
      ],
    },
    select: {
      player: { select: { userId: true } },
      pair: {
        select: {
          members: { select: { player: { select: { userId: true } } } },
        },
      },
    },
  });

  const wanted = new Set(userIds);
  const found = new Set<string>();
  for (const registration of registrations) {
    const ids = [
      registration.player?.userId,
      ...(registration.pair?.members.map((m) => m.player.userId) ?? []),
    ];
    for (const id of ids) if (id && wanted.has(id)) found.add(id);
  }
  return [...found];
}

/** A pending request in the category that already involves any of `userIds`. */
export function findPendingConflict(
  db: Db,
  categoryId: string,
  userIds: string[],
  excludeRequestId?: string
) {
  return db.tournamentRegistrationRequest.findFirst({
    where: {
      categoryId,
      status: TournamentRegistrationStatus.PENDING,
      ...(excludeRequestId && { id: { not: excludeRequestId } }),
      OR: [
        { userId: { in: userIds } },
        { partnerUserIds: { hasSome: userIds } },
      ],
    },
    select: { id: true },
  });
}

export async function categoryCounts(db: Db, categoryId: string) {
  const [matchCount, registrationCount] = await Promise.all([
    db.categoryMatch.count({ where: { categoryId } }),
    db.categoryRegistration.count({ where: { categoryId } }),
  ]);
  return { matchCount, registrationCount };
}
