import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SelectPlayersDto, PlayerWithPosition } from './dto/select-players.dto';
import { PreSelectDto } from './dto/pre-select.dto';
import { UpdateCourtDto } from './dto/update-court.dto';
import { EndMatchDto } from './dto/end-match.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CourtsService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    const court = await this.prisma.court.findUnique({
      where: { id },
      include: {
        currentPlayers: {
          select: {
            id: true,
            playerNumber: true,
            name: true,
            gender: true,
            level: true,
            levelDescription: true,
            status: true,
            courtPosition: true,
          },
        },
        currentMatch: {
          select: {
            id: true,
            startTime: true,
            status: true,
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

    if (!court) {
      throw new NotFoundException('Court not found');
    }

    return court;
  }

  async update(id: string, updateCourtDto: UpdateCourtDto) {
    const existingCourt = await this.prisma.court.findUnique({
      where: { id },
      include: {
        session: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!existingCourt) {
      throw new NotFoundException('Court not found');
    }

    // Prevent updating if session is in progress or finished
    if (existingCourt.session.status !== 'PREPARING') {
      throw new BadRequestException(
        'Cannot update court configuration when session has started or finished',
      );
    }

    const updatedCourt = await this.prisma.court.update({
      where: { id },
      data: {
        courtName: updateCourtDto.courtName ?? undefined,
        direction: updateCourtDto.direction ?? undefined,
      },
      include: {
        currentPlayers: {
          select: {
            id: true,
            playerNumber: true,
            name: true,
            gender: true,
            level: true,
            levelDescription: true,
            status: true,
            courtPosition: true,
          },
        },
        currentMatch: {
          select: {
            id: true,
            startTime: true,
            status: true,
          },
        },
      },
    });

    return updatedCourt;
  }

  async selectPlayers(id: string, selectPlayersDto: SelectPlayersDto) {
    const { playerIds, players: playersWithPosition } = selectPlayersDto;

    // Support both old format (playerIds only) and new format (players with position)
    let finalPlayerIds: string[];
    let positionInfo: PlayerWithPosition[] | null = null;

    if (playersWithPosition && Array.isArray(playersWithPosition)) {
      finalPlayerIds = playersWithPosition.map((p) => p.playerId);
      positionInfo = playersWithPosition;
    } else if (playerIds && Array.isArray(playerIds)) {
      finalPlayerIds = playerIds;
    } else {
      throw new BadRequestException(
        'Either playerIds or players with position must be provided',
      );
    }

    // Validate court exists
    const court = await this.prisma.court.findUnique({
      where: { id },
      include: {
        session: true,
        currentPlayers: true,
      },
    });

    if (!court) {
      throw new NotFoundException('Court not found');
    }

    // Validate session is in progress
    if (court.session.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Cannot select players for a session that is not in progress',
      );
    }

    // Validate court is empty
    if (court.status === 'IN_USE') {
      throw new BadRequestException('Court is already in use');
    }

    // Validate exactly 4 player IDs
    if (!Array.isArray(finalPlayerIds) || finalPlayerIds.length !== 4) {
      throw new BadRequestException('Exactly 4 players must be selected');
    }

    // If position info is provided, validate positions
    if (positionInfo) {
      const positions = positionInfo.map((p) => p.position);
      const expectedPositions = [0, 1, 2, 3];
      if (!expectedPositions.every((pos) => positions.includes(pos))) {
        throw new BadRequestException(
          'Position info must include positions 0, 1, 2, and 3',
        );
      }
    }

    // Validate all players exist and are in waiting state
    const validPlayers = await this.prisma.player.findMany({
      where: {
        id: { in: finalPlayerIds },
      },
    });

    if (validPlayers.length !== 4) {
      throw new NotFoundException('One or more selected players do not exist');
    }

    const nonWaitingPlayers = validPlayers.filter(
      (player) => player.status !== 'WAITING',
    );
    if (nonWaitingPlayers.length > 0) {
      throw new BadRequestException(
        `Players ${nonWaitingPlayers.map((p) => p.playerNumber).join(', ')} are not in waiting state`,
      );
    }

    // All validations passed, prepare for transaction
    const result = await this.prisma.$transaction(
      async (tx) => {
        if (positionInfo) {
          const sortedPositionInfo = positionInfo.sort(
            (a, b) => a.position - b.position,
          );

          for (let i = 0; i < sortedPositionInfo.length; i++) {
            const { playerId, position } = sortedPositionInfo[i];
            await tx.player.update({
              where: { id: playerId },
              data: {
                status: 'READY',
                currentCourtId: id,
                courtPosition: position,
              },
            });
          }
        } else {
          const playerUpdatePromises = finalPlayerIds.map(
            async (playerId: string, index: number) => {
              return tx.player.update({
                where: { id: playerId },
                data: {
                  status: 'READY',
                  currentCourtId: id,
                  courtPosition: index,
                },
              });
            },
          );
          await Promise.all(playerUpdatePromises);
        }

        const updatedCourt = await tx.court.update({
          where: { id },
          data: {
            status: 'READY',
          },
          include: {
            currentPlayers: true,
          },
        });

        return updatedCourt;
      },
      {
        maxWait: 10000,
        timeout: 15000,
      },
    );

    return result;
  }

  async deselectPlayers(id: string) {
    const court = await this.prisma.court.findUnique({
      where: { id },
      include: {
        session: true,
        currentPlayers: true,
      },
    });

    if (!court) {
      throw new NotFoundException('Court not found');
    }

    if (court.session.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Cannot deselect players for a session that is not in progress',
      );
    }

    if (court.status !== 'READY') {
      throw new BadRequestException(
        'Can only deselect players from a court in READY state',
      );
    }

    if (!court.currentPlayers || court.currentPlayers.length === 0) {
      throw new BadRequestException(
        'No players are currently assigned to this court',
      );
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        const playersToDeselect = court.currentPlayers.map(
          (player) => player.id,
        );

        const playerUpdatePromises = playersToDeselect.map(async (playerId) => {
          return tx.player.update({
            where: { id: playerId },
            data: {
              status: 'WAITING',
              currentCourtId: null,
              courtPosition: null,
            },
          });
        });

        await Promise.all(playerUpdatePromises);

        const updatedCourt = await tx.court.update({
          where: { id },
          data: {
            status: 'EMPTY',
          },
          include: {
            currentPlayers: true,
          },
        });

        return updatedCourt;
      },
      {
        maxWait: 10000,
        timeout: 15000,
      },
    );

    return result;
  }

  async startMatch(id: string) {
    const court = await this.prisma.court.findUnique({
      where: { id },
      include: {
        session: true,
        currentPlayers: true,
      },
    });

    if (!court) {
      throw new NotFoundException('Court not found');
    }

    if (court.currentPlayers.length !== 4) {
      throw new BadRequestException(
        'Court must have exactly 4 players to start a match',
      );
    }

    if (court.session.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Cannot start a match for a session that is not in progress',
      );
    }

    if (court.currentMatchId) {
      throw new BadRequestException('Court already has an active match');
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        const currentTime = new Date();
        const isExtra = court.session.endTime
          ? currentTime > court.session.endTime
          : false;

        const match = await tx.match.create({
          data: {
            sessionId: court.sessionId,
            courtId: id,
            status: 'IN_PROGRESS',
            startTime: currentTime,
            isExtra: isExtra,
          },
        });

        const playerUpdatePromises = court.currentPlayers.map(
          async (player, i) => {
            await tx.matchPlayer.create({
              data: {
                matchId: match.id,
                playerId: player.id,
                position: i,
              },
            });

            return tx.player.update({
              where: { id: player.id },
              data: {
                matchesPlayed: {
                  increment: 1,
                },
                status: 'PLAYING',
                currentWaitTime: 0,
              },
            });
          },
        );

        await Promise.all(playerUpdatePromises);

        const updatedCourt = await tx.court.update({
          where: { id },
          data: {
            currentMatchId: match.id,
            status: 'IN_USE',
          },
          include: {
            currentPlayers: true,
            currentMatch: true,
          },
        });

        return {
          court: updatedCourt,
          match,
        };
      },
      {
        maxWait: 10000,
        timeout: 15000,
      },
    );

    return result;
  }

  async endMatch(id: string, endMatchDto?: EndMatchDto) {
    const court = await this.prisma.court.findUnique({
      where: { id },
      include: {
        session: true,
        currentPlayers: true,
        currentMatch: true,
      },
    });

    if (!court) {
      throw new NotFoundException('Court not found');
    }

    if (!court.currentMatchId || !court.currentMatch) {
      throw new BadRequestException('Court does not have an active match');
    }

    if (court.session.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Cannot end a match for a session that is not in progress',
      );
    }

    // Parse score and winnerIds
    let score: string | undefined;
    let winnerIds: string | undefined;
    if (endMatchDto) {
      if (endMatchDto.score !== undefined) {
        score =
          typeof endMatchDto.score === 'object'
            ? JSON.stringify(endMatchDto.score)
            : endMatchDto.score;
      }
      if (endMatchDto.winnerIds !== undefined) {
        winnerIds = Array.isArray(endMatchDto.winnerIds)
          ? JSON.stringify(endMatchDto.winnerIds)
          : endMatchDto.winnerIds;
      }
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        const match = await tx.match.update({
          where: { id: court.currentMatchId! },
          data: {
            status: 'FINISHED',
            endTime: new Date(),
            ...(score !== undefined ? { score } : {}),
            ...(winnerIds !== undefined ? { winnerIds } : {}),
            ...(endMatchDto?.isDraw !== undefined
              ? { isDraw: endMatchDto.isDraw }
              : {}),
            ...(endMatchDto?.notes !== undefined
              ? { notes: endMatchDto.notes }
              : {}),
          },
        });

        const playerUpdatePromises = court.currentPlayers.map(
          async (player) => {
            return tx.player.update({
              where: { id: player.id },
              data: {
                status: 'WAITING',
                currentCourtId: null,
                currentWaitTime: 0,
              },
            });
          },
        );

        await Promise.all(playerUpdatePromises);

        // Check for pre-selected players
        let nextCourtStatus: 'EMPTY' | 'READY' = 'EMPTY';

        if (court.preSelectedPlayers) {
          try {
            const preSelectedData =
              typeof court.preSelectedPlayers === 'string'
                ? JSON.parse(court.preSelectedPlayers)
                : court.preSelectedPlayers;

            if (
              preSelectedData &&
              Array.isArray(preSelectedData) &&
              preSelectedData.length > 0
            ) {
              const preSelectedPlayerIds = preSelectedData.map(
                (p: any) => p.playerId,
              );

              const availablePlayers = await tx.player.findMany({
                where: {
                  id: { in: preSelectedPlayerIds },
                  status: 'WAITING',
                  currentCourtId: null,
                },
              });

              if (availablePlayers.length === preSelectedPlayerIds.length) {
                nextCourtStatus = 'READY';

                const sortedPreSelectedData = preSelectedData.sort(
                  (a: any, b: any) => a.position - b.position,
                );

                for (let i = 0; i < sortedPreSelectedData.length; i++) {
                  const { playerId, position } = sortedPreSelectedData[i];
                  await tx.player.update({
                    where: { id: playerId },
                    data: {
                      status: 'READY',
                      currentCourtId: id,
                      courtPosition: position,
                    },
                  });
                }

                await tx.court.update({
                  where: { id },
                  data: {
                    preSelectedPlayers: Prisma.DbNull,
                    updatedAt: new Date(),
                  },
                });
              } else {
                await tx.court.update({
                  where: { id },
                  data: {
                    preSelectedPlayers: Prisma.DbNull,
                    updatedAt: new Date(),
                  },
                });
              }
            }
          } catch {
            await tx.court.update({
              where: { id },
              data: {
                preSelectedPlayers: Prisma.DbNull,
                updatedAt: new Date(),
              },
            });
          }
        }

        const updatedCourt = await tx.court.update({
          where: { id },
          data: {
            status: nextCourtStatus,
            currentMatchId: null,
          },
          include: {
            currentPlayers: true,
          },
        });

        return {
          court: updatedCourt,
          match,
          players: court.currentPlayers,
        };
      },
      {
        maxWait: 10000,
        timeout: 15000,
      },
    );

    return result;
  }

  async getCurrentMatch(id: string) {
    const court = await this.prisma.court.findUnique({
      where: { id },
      include: {
        session: true,
      },
    });

    if (!court) {
      throw new NotFoundException('Court not found');
    }

    if (!court.currentMatchId) {
      return null;
    }

    const match = await this.prisma.match.findUnique({
      where: { id: court.currentMatchId },
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
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const durationMinutes = Math.floor(
      (Date.now() - match.startTime.getTime()) / (1000 * 60),
    );

    return {
      ...match,
      durationMinutes,
    };
  }

  async preSelect(id: string, preSelectDto: PreSelectDto) {
    const { playersWithPosition } = preSelectDto;

    if (
      !playersWithPosition ||
      !Array.isArray(playersWithPosition) ||
      playersWithPosition.length !== 4
    ) {
      throw new BadRequestException(
        'Must provide exactly 4 players with positions',
      );
    }

    for (const player of playersWithPosition) {
      if (
        !player.playerId ||
        typeof player.position !== 'number' ||
        player.position < 0 ||
        player.position > 3
      ) {
        throw new BadRequestException(
          'Each player must have playerId and position (0-3)',
        );
      }
    }

    const court = await this.prisma.court.findUnique({
      where: { id },
      include: {
        currentMatch: true,
        session: true,
      },
    });

    if (!court) {
      throw new NotFoundException('Court not found');
    }

    if (court.status !== 'IN_USE' || !court.currentMatch) {
      throw new BadRequestException(
        'Can only pre-select for courts that are currently in use',
      );
    }

    const playerIds = playersWithPosition.map((p) => p.playerId);
    const players = await this.prisma.player.findMany({
      where: {
        id: { in: playerIds },
        sessionId: court.sessionId,
        status: 'WAITING',
      },
    });

    if (players.length !== 4) {
      throw new BadRequestException(
        'All selected players must exist and be in WAITING status',
      );
    }

    const updatedCourt = await this.prisma.court.update({
      where: { id },
      data: {
        preSelectedPlayers: playersWithPosition.map((p) => ({ playerId: p.playerId, position: p.position })),
        updatedAt: new Date(),
      },
      include: {
        currentPlayers: {
          select: {
            id: true,
            playerNumber: true,
            name: true,
            gender: true,
            level: true,
            levelDescription: true,
            status: true,
            currentCourtId: true,
            courtPosition: true,
            updatedAt: true,
          },
          orderBy: {
            courtPosition: 'asc',
          },
        },
        currentMatch: {
          include: {
            players: {
              select: {
                playerId: true,
                position: true,
              },
              orderBy: {
                position: 'asc',
              },
            },
          },
        },
      },
    });

    return updatedCourt;
  }

  async cancelPreSelect(id: string) {
    const court = await this.prisma.court.findUnique({
      where: { id },
    });

    if (!court) {
      throw new NotFoundException('Court not found');
    }

    const updatedCourt = await this.prisma.court.update({
      where: { id },
      data: {
        preSelectedPlayers: Prisma.DbNull,
        updatedAt: new Date(),
      },
      include: {
        currentPlayers: true,
        currentMatch: true,
      },
    });

    return updatedCourt;
  }

  async getPreSelect(id: string) {
    const court = await this.prisma.court.findUnique({
      where: { id },
      select: {
        id: true,
        preSelectedPlayers: true,
      },
    });

    if (!court) {
      throw new NotFoundException('Court not found');
    }

    let preSelectedPlayersInfo: any[] | null = null;
    if (court.preSelectedPlayers && Array.isArray(court.preSelectedPlayers)) {
      const playerIds = (court.preSelectedPlayers as any[]).map(
        (p) => p.playerId,
      );
      const players = await this.prisma.player.findMany({
        where: {
          id: { in: playerIds },
        },
        select: {
          id: true,
          playerNumber: true,
          name: true,
          gender: true,
          level: true,
          levelDescription: true,
          status: true,
          currentWaitTime: true,
          totalWaitTime: true,
          matchesPlayed: true,
        },
      });

      preSelectedPlayersInfo = (court.preSelectedPlayers as any[]).map((p) => ({
        ...p,
        player: players.find((player) => player.id === p.playerId),
      }));
    }

    return {
      courtId: court.id,
      preSelectedPlayers: preSelectedPlayersInfo,
    };
  }

  async getSuggestedPlayers(id: string, topCount?: number) {
    const court = await this.prisma.court.findUnique({
      where: { id },
      include: {
        session: true,
      },
    });

    if (!court) {
      throw new NotFoundException('Court not found');
    }

    if (court.session.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Cannot get suggested players for a session that is not in progress',
      );
    }

    if (court.status === 'IN_USE') {
      throw new BadRequestException('Court is already in use');
    }

    if (topCount !== undefined && topCount < 4) {
      throw new BadRequestException('topCount must be at least 4');
    }

    const waitingPlayers = await this.prisma.player.findMany({
      where: {
        sessionId: court.sessionId,
        status: 'WAITING',
      },
      orderBy: {
        currentWaitTime: 'desc',
      },
      take: topCount || undefined,
    });

    if (waitingPlayers.length < 4) {
      throw new BadRequestException(
        'Not enough waiting players to start a match',
      );
    }

    const balancedPairs = this.findBalancedPairs(waitingPlayers);

    if (!balancedPairs) {
      throw new BadRequestException('Could not find balanced pairs');
    }

    const pair1TotalScore = balancedPairs.pair1.reduce(
      (sum, player) => sum + this.getLevelScore(player.level),
      0,
    );
    const pair2TotalScore = balancedPairs.pair2.reduce(
      (sum, player) => sum + this.getLevelScore(player.level),
      0,
    );

    return {
      pair1: {
        players: balancedPairs.pair1,
        totalLevelScore: pair1TotalScore,
      },
      pair2: {
        players: balancedPairs.pair2,
        totalLevelScore: pair2TotalScore,
      },
      scoreDifference: Math.abs(pair1TotalScore - pair2TotalScore),
      totalPlayersConsidered: waitingPlayers.length,
    };
  }

  // Helper functions
  private getLevelScore(level: string | null): number {
    if (!level) return 4;
    const levelMap: { [key: string]: number } = {
      Y_MINUS: 1,
      Y: 1.5,
      Y_PLUS: 2,
      TBY: 3,
      TB_MINUS: 4,
      TB: 4.5,
      TB_PLUS: 5,
      K: 6,
    };
    return levelMap[level] || 4;
  }

  private findBalancedPairs(players: any[]): { pair1: any[]; pair2: any[] } | null {
    if (players.length < 4) return null;

    let bestPairs: { pair1: any[]; pair2: any[] } | null = null;
    let smallestDifference = Infinity;

    for (let i = 0; i < players.length - 3; i++) {
      for (let j = i + 1; j < players.length - 2; j++) {
        for (let k = j + 1; k < players.length - 1; k++) {
          for (let l = k + 1; l < players.length; l++) {
            const fourPlayers = [players[i], players[j], players[k], players[l]];

            const combinations = [
              {
                pair1: [fourPlayers[0], fourPlayers[1]],
                pair2: [fourPlayers[2], fourPlayers[3]],
              },
              {
                pair1: [fourPlayers[0], fourPlayers[2]],
                pair2: [fourPlayers[1], fourPlayers[3]],
              },
              {
                pair1: [fourPlayers[0], fourPlayers[3]],
                pair2: [fourPlayers[1], fourPlayers[2]],
              },
            ];

            for (const combo of combinations) {
              const pair1Score =
                this.getLevelScore(combo.pair1[0].level) +
                this.getLevelScore(combo.pair1[1].level);
              const pair2Score =
                this.getLevelScore(combo.pair2[0].level) +
                this.getLevelScore(combo.pair2[1].level);
              const difference = Math.abs(pair1Score - pair2Score);

              if (difference < smallestDifference) {
                smallestDifference = difference;
                bestPairs = combo;
              }
            }
          }
        }
      }
    }

    return bestPairs;
  }
}
