import { Prisma } from '@prisma/client';

/**
 * Shared Prisma include used by live-scoring reads, scoreboard broadcasts, and
 * the public scoreboard endpoint, so the normalized payload always carries
 * participant names, court, category (+ tournamentId/hostId) and referee.
 */
export const MATCH_SCORING_INCLUDE = {
  participants: {
    include: {
      categoryRegistration: {
        include: {
          player: true,
          pair: {
            include: {
              members: {
                include: { player: true },
                orderBy: { position: 'asc' },
              },
            },
          },
        },
      },
    },
  },
  court: true,
  group: true,
  category: {
    select: {
      id: true,
      name: true,
      tournamentId: true,
      type: true,
      matchFormat: true,
      pointsToWin: true,
      winByTwo: true,
      pointCap: true,
      knockoutPointsToWin: true,
      knockoutWinByTwo: true,
      knockoutPointCap: true,
      finalPointsToWin: true,
      finalWinByTwo: true,
      finalPointCap: true,
      tournament: { select: { hostId: true, sportType: true } },
    },
  },
  referee: { select: { id: true, name: true, userId: true } },
} satisfies Prisma.CategoryMatchInclude;
