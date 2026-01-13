/**
 * Data Migration Script: Set waitingSince for existing WAITING players
 * 
 * Run this script to migrate existing data:
 * npx ts-node prisma/migrations/migrate-waiting-since.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting waitingSince migration...');

  // Find all players with WAITING status that don't have waitingSince set
  const waitingPlayers = await prisma.player.findMany({
    where: {
      status: 'WAITING',
      waitingSince: null,
    },
  });

  console.log(`Found ${waitingPlayers.length} WAITING players without waitingSince`);

  if (waitingPlayers.length === 0) {
    console.log('No players to migrate. Done!');
    return;
  }

  // For each player, calculate waitingSince based on currentWaitTime
  // waitingSince = now - currentWaitTime (in ms)
  const now = new Date();
  
  for (const player of waitingPlayers) {
    // Convert currentWaitTime (minutes) back to a timestamp
    const waitingSince = new Date(now.getTime() - (player.currentWaitTime * 60000));
    
    await prisma.player.update({
      where: { id: player.id },
      data: { waitingSince },
    });
    
    console.log(
      `Migrated player ${player.playerNumber} (${player.name || 'unnamed'}): ` +
      `currentWaitTime=${player.currentWaitTime}min -> waitingSince=${waitingSince.toISOString()}`
    );
  }

  console.log(`\nMigration complete! Updated ${waitingPlayers.length} players.`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
