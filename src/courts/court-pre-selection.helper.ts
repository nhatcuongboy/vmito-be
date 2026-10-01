import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

export interface PlayerBooking {
  courtId: string;
  courtDisplayName: string;
}

/**
 * Reads the ids out of `Court.preSelectedPlayers`.
 *
 * The column is raw JSON, and `endMatch` already tolerates a JSON string in
 * it, so this does too. Anything unreadable counts as "nobody booked" rather
 * than throwing: a malformed lineup must not block assigning other players.
 */
export function parsePreSelectedPlayerIds(
  value: Prisma.JsonValue | undefined
): string[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry) => {
    const playerId = (entry as { playerId?: unknown } | null)?.playerId;
    return typeof playerId === 'string' ? [playerId] : [];
  });
}

/**
 * Players already booked into the *next* match of a court other than
 * `exceptCourtId`, keyed by player id.
 *
 * A pre-selected player stays `WAITING` until their court's match ends, so
 * status alone cannot tell them apart from a free player. Without this check a
 * player could be put on a second court (or booked for two); when the first
 * court's match ended, `endMatch` would find them no longer free and discard
 * that court's lineup without telling the host.
 */
export async function findPlayersBookedElsewhere(
  prisma: PrismaClientLike,
  sessionId: string,
  exceptCourtId: string
): Promise<Map<string, PlayerBooking>> {
  const courts = await prisma.court.findMany({
    where: { sessionId, id: { not: exceptCourtId } },
    select: {
      id: true,
      courtNumber: true,
      courtName: true,
      preSelectedPlayers: true,
    },
    orderBy: { courtNumber: 'asc' },
  });

  const booked = new Map<string, PlayerBooking>();
  for (const court of courts) {
    const courtDisplayName = court.courtName || `Sân ${court.courtNumber}`;
    for (const playerId of parsePreSelectedPlayerIds(
      court.preSelectedPlayers
    )) {
      // Lowest-numbered court wins if the data ever lists a player twice.
      if (!booked.has(playerId)) {
        booked.set(playerId, { courtId: court.id, courtDisplayName });
      }
    }
  }
  return booked;
}

/**
 * Rejects the request when any of `players` is booked for another court's next
 * match. The message names the players and the court so the host knows whom to
 * swap out.
 */
export async function assertNotBookedElsewhere(
  prisma: PrismaClientLike,
  sessionId: string,
  exceptCourtId: string,
  players: { id: string; playerNumber: number }[]
): Promise<void> {
  const booked = await findPlayersBookedElsewhere(
    prisma,
    sessionId,
    exceptCourtId
  );
  if (booked.size === 0) return;

  const conflicts = players.filter((player) => booked.has(player.id));
  if (conflicts.length === 0) return;

  const numbers = conflicts.map((player) => player.playerNumber).join(', ');
  const courtNames = [
    ...new Set(
      conflicts.map((player) => booked.get(player.id)!.courtDisplayName)
    ),
  ].join(', ');
  throw new BadRequestException(
    `Players ${numbers} are already booked for the next match on ${courtNames}`
  );
}
