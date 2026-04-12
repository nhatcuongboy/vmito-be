import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMatchDto } from './dto/update-match.dto';

@Injectable()
export class MatchesService {
  constructor(private prisma: PrismaService) {}

  async remove(id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        players: {
          select: { playerId: true },
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const playerIds = match.players.map((mp) => mp.playerId);

      // Decrement matchesPlayed for all players in this match
      if (playerIds.length > 0) {
        await tx.player.updateMany({
          where: { id: { in: playerIds } },
          data: {
            matchesPlayed: { decrement: 1 },
            courtPosition: null, // Clear court position
            status: 'WAITING',
          },
        });
      }

      // Clear currentMatchId from court if this match is currently active
      await tx.court.updateMany({
        where: { currentMatchId: id },
        data: { currentMatchId: null, status: 'EMPTY' },
      });

      // Delete the MatchPlayer records (might be needed depending on cascade setup)
      await tx.matchPlayer.deleteMany({
        where: { matchId: id },
      });

      // Delete the match
      return tx.match.delete({
        where: { id },
        include: {
          players: true,
          court: true,
          session: true,
        },
      });
    });
  }

  async findOne(id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        players: {
          include: {
            player: {
              select: {
                id: true,
                playerNumber: true,
                name: true,
                gender: true,
                level: true,
                levelDescription: true,
              },
            },
          },
          orderBy: {
            position: 'asc',
          },
        },
        court: {
          select: {
            id: true,
            courtNumber: true,
            courtName: true,
          },
        },
        session: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    // Parse score and winnerIds if they are JSON strings
    const formattedMatch: Record<string, unknown> = { ...match };

    if (match.score) {
      try {
        formattedMatch.score =
          typeof match.score === 'string'
            ? (JSON.parse(match.score) as unknown)
            : match.score;
      } catch {
        // Keep original if parsing fails
      }
    }

    if (match.winnerIds) {
      try {
        formattedMatch.winnerIds =
          typeof match.winnerIds === 'string'
            ? (JSON.parse(match.winnerIds) as string[])
            : (match.winnerIds as unknown);
      } catch {
        // Keep original if parsing fails
      }
    }

    // Calculate duration if match has startTime
    if (match.startTime) {
      const endTime = match.endTime || new Date();
      formattedMatch.durationMinutes = Math.floor(
        (endTime.getTime() - match.startTime.getTime()) / (1000 * 60)
      );
    }

    return formattedMatch;
  }

  async update(id: string, updateMatchDto: UpdateMatchDto) {
    const existingMatch = await this.prisma.match.findUnique({
      where: { id },
    });

    if (!existingMatch) {
      throw new NotFoundException('Match not found');
    }

    // Prepare data for update
    const updateData: {
      score?: string;
      winnerIds?: string;
      isDraw?: boolean;
      notes?: string;
      isExtra?: boolean;
    } = {};

    if (updateMatchDto.score !== undefined) {
      updateData.score =
        typeof updateMatchDto.score === 'object'
          ? JSON.stringify(updateMatchDto.score)
          : String(updateMatchDto.score);
    }

    if (updateMatchDto.winnerIds !== undefined) {
      updateData.winnerIds = Array.isArray(updateMatchDto.winnerIds)
        ? JSON.stringify(updateMatchDto.winnerIds)
        : updateMatchDto.winnerIds;
    }

    if (updateMatchDto.isDraw !== undefined) {
      updateData.isDraw = updateMatchDto.isDraw;
    }

    if (updateMatchDto.notes !== undefined) {
      updateData.notes = updateMatchDto.notes;
    }

    if (updateMatchDto.isExtra !== undefined) {
      updateData.isExtra = updateMatchDto.isExtra;
    }

    const updatedMatch = await this.prisma.$transaction(async (tx) => {
      // Handle player updates if provided
      if (updateMatchDto.playerIds && updateMatchDto.playerIds.length > 0) {
        // Validation: Verify 4 players
        if (updateMatchDto.playerIds.length !== 4) {
          throw new BadRequestException(
            'Exactly 4 players are required for a match'
          );
        }

        // Constraint: Only allow updating players for finished matches
        if (existingMatch.status !== 'FINISHED') {
          throw new BadRequestException(
            'Cannot change players for an in-progress match. Only completed matches can be edited.'
          );
        }

        // Get current match players to compare
        const currentMatchPlayers = await tx.matchPlayer.findMany({
          where: { matchId: id },
          select: { playerId: true },
        });

        const currentPlayerIds = currentMatchPlayers.map((mp) => mp.playerId);
        const newPlayerIds = updateMatchDto.playerIds;

        // Identify players to remove and add
        const playersToRemove = currentPlayerIds.filter(
          (pid) => !newPlayerIds.includes(pid)
        );
        const playersToAdd = newPlayerIds.filter(
          (pid) => !currentPlayerIds.includes(pid)
        );

        if (playersToRemove.length > 0 || playersToAdd.length > 0) {
          // Verify new players exist in session
          const newPlayersCount = await tx.player.count({
            where: {
              id: { in: newPlayerIds },
              sessionId: existingMatch.sessionId,
            },
          });

          if (newPlayersCount !== 4) {
            throw new BadRequestException(
              'One or more selected players provided do not exist in this session'
            );
          }

          // 1. Remove old match players
          await tx.matchPlayer.deleteMany({
            where: {
              matchId: id,
              playerId: { in: playersToRemove },
            },
          });

          // 2. Decrement matchesPlayed for removed players
          await tx.player.updateMany({
            where: { id: { in: playersToRemove } },
            data: { matchesPlayed: { decrement: 1 } },
          });

          // 3. Increment matchesPlayed for added players
          await tx.player.updateMany({
            where: { id: { in: playersToAdd } },
            data: { matchesPlayed: { increment: 1 } },
          });

          // 4. Create new match players
          // We need to be careful with positions.
          // Simplest strategy: Delete ALL and recreate ALL to ensure positions are correct [0,1,2,3]
          // However, we just deleted 'removed' ones.
          // Let's completely reset the players for this match to ensure correct ordering/positioning requested by user.
          // Re-fetching to be safe or just wipe and recreate.
          // Wiping all is safer to guarantee positions match the input array order [0,1,2,3]

          // Re-do: Wipe ALL match players for this match
          // We already handled stats for diff. Now just fix table.

          // Optimization: We already deleted `playersToRemove`.
          // But `position` might be messed up if we just add new ones.
          // E.g. removed pos 0. Added new player. Should it take pos 0?
          // Yes, the input `playerIds` array implies order [0, 1, 2, 3].

          // Safer approach: Delete ALL match players for this match, then create ALL 4.
          // Limitation: `playersToRemove` logic above assumed we only touched diffs.
          // That logic was correct for stats.
          // For the `match_players` table, let's just clear and refill to match the exact order of `playerIds`.

          // Delete remaining match players (the ones we didn't remove yet, i.e., those that stayed)
          const remainingPlayerIds = currentPlayerIds.filter((pid) =>
            newPlayerIds.includes(pid)
          );
          if (remainingPlayerIds.length > 0) {
            await tx.matchPlayer.deleteMany({
              where: {
                matchId: id,
                playerId: { in: remainingPlayerIds },
              },
            });
          }

          // Create all 4 match players with correct positions
          await tx.matchPlayer.createMany({
            data: newPlayerIds.map((playerId, index) => ({
              matchId: id,
              playerId,
              position: index,
            })),
          });
        }
      }

      return tx.match.update({
        where: { id },
        data: updateData,
        include: {
          players: {
            include: {
              player: {
                select: {
                  id: true,
                  playerNumber: true,
                  name: true,
                  gender: true,
                  level: true,
                },
              },
            },
            orderBy: {
              position: 'asc',
            },
          },
          court: {
            select: {
              id: true,
              courtNumber: true,
              courtName: true,
            },
          },
        },
      });
    });

    return updatedMatch;

    return updatedMatch;
  }

  async findBySession(
    sessionId: string,
    options?: {
      playerId?: string;
      courtId?: string;
    }
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const whereCondition: {
      sessionId: string;
      courtId?: string;
      players?: { some: { playerId: string } };
    } = { sessionId };

    if (options?.courtId) {
      whereCondition.courtId = options.courtId;
    }

    if (options?.playerId) {
      whereCondition.players = {
        some: {
          playerId: options.playerId,
        },
      };
    }

    const matches = await this.prisma.match.findMany({
      where: whereCondition,
      include: {
        players: {
          include: {
            player: true,
          },
          orderBy: {
            position: 'asc',
          },
        },
        court: true,
      },
      orderBy: {
        startTime: 'desc',
      },
    });

    // Format matches
    const formattedMatches = matches.map((match) => {
      const formattedMatch: Record<string, unknown> = { ...match };

      if (match.score) {
        try {
          formattedMatch.score =
            typeof match.score === 'string'
              ? (JSON.parse(match.score) as unknown)
              : match.score;
        } catch {
          // Keep original
        }
      }

      if (match.winnerIds) {
        try {
          formattedMatch.winnerIds =
            typeof match.winnerIds === 'string'
              ? (JSON.parse(match.winnerIds) as string[])
              : (match.winnerIds as unknown);
        } catch {
          // Keep original
        }
      }

      return formattedMatch;
    });

    return {
      matches: formattedMatches,
      totalMatches: formattedMatches.length,
      filters: {
        playerId: options?.playerId || null,
        courtId: options?.courtId || null,
      },
    };
  }

  async createMatch(sessionId: string, courtId: string, playerIds: string[]) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Cannot create a match for a session that is not in progress'
      );
    }

    if (!playerIds || !Array.isArray(playerIds) || playerIds.length !== 4) {
      throw new BadRequestException(
        'Exactly 4 players are required to start a match'
      );
    }

    const court = await this.prisma.court.findUnique({
      where: { id: courtId },
      include: { currentMatch: true },
    });

    if (!court) {
      throw new NotFoundException('Court not found');
    }

    if (court.status === 'IN_USE' || court.currentMatchId) {
      throw new BadRequestException('Court is already in use');
    }

    const players = await this.prisma.player.findMany({
      where: {
        id: { in: playerIds },
        sessionId,
        status: 'WAITING',
      },
    });

    if (players.length !== 4) {
      throw new BadRequestException(
        'One or more selected players are not available'
      );
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        const newMatch = await tx.match.create({
          data: {
            sessionId,
            courtId,
            status: 'IN_PROGRESS',
            startTime: new Date(),
          },
        });

        const matchPlayerPromises = playerIds.map((playerId, index) => {
          return tx.matchPlayer.create({
            data: {
              matchId: newMatch.id,
              playerId,
              position: index,
            },
          });
        });

        await Promise.all(matchPlayerPromises);

        await tx.court.update({
          where: { id: courtId },
          data: {
            status: 'IN_USE',
            currentMatchId: newMatch.id,
          },
        });

        await tx.player.updateMany({
          where: {
            id: { in: playerIds },
          },
          data: {
            status: 'PLAYING',
            currentCourtId: courtId,
            currentWaitTime: 0,
          },
        });

        return newMatch;
      },
      {
        maxWait: 10000,
        timeout: 15000,
      }
    );

    const matchData = await this.prisma.match.findUnique({
      where: { id: result.id },
      include: {
        players: {
          include: {
            player: true,
          },
        },
        court: true,
      },
    });

    return matchData;
  }
}
