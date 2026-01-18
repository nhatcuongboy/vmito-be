/**
 * Utility functions for calculating wait times dynamically
 */

/**
 * Calculate current wait time in minutes from a waitingSince timestamp
 * @param waitingSince - The timestamp when the player started waiting
 * @returns Number of minutes waited (0 if waitingSince is null/undefined)
 */
export function calculateWaitTime(
  waitingSince: Date | null | undefined
): number {
  if (!waitingSince) return 0;
  const now = Date.now();
  const waitingStart = new Date(waitingSince).getTime();
  return Math.floor((now - waitingStart) / 60000); // Convert ms to minutes
}

/**
 * Enrich a player object with calculated currentWaitTime
 * Preserves backward compatibility by computing currentWaitTime from waitingSince
 */
export function enrichPlayerWithWaitTime<
  T extends { waitingSince?: Date | null; currentWaitTime?: number },
>(player: T): T & { currentWaitTime: number } {
  const calculatedWaitTime = calculateWaitTime(player.waitingSince);
  return {
    ...player,
    currentWaitTime: calculatedWaitTime,
  };
}

/**
 * Enrich an array of players with calculated wait times
 */
export function enrichPlayersWithWaitTime<
  T extends { waitingSince?: Date | null; currentWaitTime?: number },
>(players: T[]): (T & { currentWaitTime: number })[] {
  return players.map(enrichPlayerWithWaitTime);
}
