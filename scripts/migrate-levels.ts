import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting level migration...');

  try {
    // 1. Shift User levels
    // Update matching users (level >= 2)
    const updateUsers = await prisma.user.updateMany({
      where: {
        level: {
          gte: 2,
        },
      },
      data: {
        level: {
          increment: 1,
        },
      },
    });
    console.log(`Shifted levels for ${updateUsers.count} users.`);

    // 2. Shift Player levels
    const updatePlayers = await prisma.player.updateMany({
      where: {
        level: {
          gte: 2,
        },
      },
      data: {
        level: {
          increment: 1,
        },
      },
    });
    console.log(`Shifted levels for ${updatePlayers.count} players.`);

    // 3. Shift Session requiredLevels
    const sessions = await prisma.session.findMany({
      where: {
        requiredLevels: {
            isEmpty: false
        }
      }
    });

    let sessionsUpdated = 0;
    for (const session of sessions) {
      if (!session.requiredLevels || session.requiredLevels.length === 0) continue;

      const newRequiredLevels = session.requiredLevels.map((lvl) => {
        return lvl >= 2 ? lvl + 1 : lvl;
      });

      // Only update if changed
      const isChanged = JSON.stringify(newRequiredLevels) !== JSON.stringify(session.requiredLevels);
      
      if (isChanged) {
        await prisma.session.update({
            where: { id: session.id },
            data: { requiredLevels: newRequiredLevels }
        });
        sessionsUpdated++;
      }
    }
    console.log(`Updated requiredLevels for ${sessionsUpdated} sessions.`);

    // 4. Backfill Player null levels
    // We want to set level to the first allowed level of the session if possible.
    // Fetch players with null level who are in a session
    const nullLevelPlayers = await prisma.player.findMany({
        where: {
            level: null,
            sessionId: { not: undefined } // Should always be true for players in session
        },
        include: {
            session: true
        }
    });

    let playersBackfilled = 0;
    for (const player of nullLevelPlayers) {
        if (player.session && player.session.requiredLevels && player.session.requiredLevels.length > 0) {
            // Use the first valid level from the *already updated* session requirements
            const defaultLevel = player.session.requiredLevels[0];
            await prisma.player.update({
                where: { id: player.id },
                data: { level: defaultLevel }
            });
            playersBackfilled++;
        }
    }
    console.log(`Backfilled level for ${playersBackfilled} players (out of ${nullLevelPlayers.length} with null level).`);

    console.log('Level migration completed successfully.');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
