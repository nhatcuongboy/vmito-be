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
  return parsePreSelectedEntries(value).map((entry) => entry.playerId);
}

export interface PreSelectedEntry {
  playerId: string;
  position: number;
}

/** Same tolerance as [parsePreSelectedPlayerIds], keeping the seat too. */
export function parsePreSelectedEntries(
  value: Prisma.JsonValue | undefined
): PreSelectedEntry[] {
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
    const { playerId, position } = (entry ?? {}) as {
      playerId?: unknown;
      position?: unknown;
    };
    return typeof playerId === 'string' && typeof position === 'number'
      ? [{ playerId, position }]
      : [];
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

export interface PromotedPreSelection {
  courtId: string;
  playerIds: string[];
}

/**
 * Moves every parked next-match lineup whose players are all free onto its
 * court, and returns the courts that were filled.
 *
 * A lineup may name players who are still playing (or waiting to start) on
 * another court. It is parked on its EMPTY court rather than dropped, and this
 * runs whenever players are released so it can finish the job. Promotion only
 * happens when every player is `WAITING` with no court, which is what keeps a
 * player on one court at a time.
 *
 * A lineup that can never be satisfied (a player left the session or
 * finished) is dropped instead of parking the court forever.
 */
export async function promotePendingPreSelections(
  tx: Prisma.TransactionClient,
  sessionId: string
): Promise<PromotedPreSelection[]> {
  const courts = await tx.court.findMany({
    where: { sessionId, status: 'EMPTY', currentMatchId: null },
    select: { id: true, preSelectedPlayers: true },
    orderBy: { courtNumber: 'asc' },
  });

  const promoted: PromotedPreSelection[] = [];
  for (const court of courts) {
    if (court.preSelectedPlayers === null) continue;
    const entries = parsePreSelectedEntries(court.preSelectedPlayers);
    if (entries.length === 0) {
      // Unreadable or empty: nothing to wait for, and left in place it would
      // read as a booking on the court.
      await tx.court.update({
        where: { id: court.id },
        data: { preSelectedPlayers: Prisma.DbNull, updatedAt: new Date() },
      });
      continue;
    }

    const playerIds = entries.map((entry) => entry.playerId);
    const players = await tx.player.findMany({
      where: { id: { in: playerIds }, sessionId },
      select: { id: true, status: true, currentCourtId: true },
    });

    const isGone =
      players.length !== playerIds.length ||
      players.some(
        (player) => player.status === 'INACTIVE' || player.status === 'FINISHED'
      );
    if (isGone) {
      await tx.court.update({
        where: { id: court.id },
        data: { preSelectedPlayers: Prisma.DbNull, updatedAt: new Date() },
      });
      continue;
    }

    const isEveryoneFree = players.every(
      (player) => player.status === 'WAITING' && player.currentCourtId === null
    );
    if (!isEveryoneFree) continue;

    for (const { playerId, position } of [...entries].sort(
      (a, b) => a.position - b.position
    )) {
      await tx.player.update({
        where: { id: playerId },
        data: {
          status: 'READY',
          currentCourtId: court.id,
          courtPosition: position,
        },
      });
    }
    await tx.court.update({
      where: { id: court.id },
      data: {
        status: 'READY',
        preSelectedPlayers: Prisma.DbNull,
        updatedAt: new Date(),
      },
    });
    promoted.push({ courtId: court.id, playerIds });
  }
  return promoted;
}
