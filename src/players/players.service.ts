import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { ConfirmPlayerDto } from './dto/confirm-player.dto';
import { generatePlayerJoinCode } from './utils/player-helpers';
import { Level, Gender, PlayerStatus } from '@prisma/client';

@Injectable()
export class PlayersService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    const player = await this.prisma.player.findUnique({
      where: { id },
      include: {
        session: {
          select: {
            id: true,
            name: true,
            status: true,
            requirePlayerInfo: true,
          },
        },
        currentCourt: {
          select: {
            id: true,
            courtNumber: true,
            courtName: true,
          },
        },
        matchPlayers: {
          select: {
            match: {
              select: {
                id: true,
                startTime: true,
                endTime: true,
                status: true,
                courtId: true,
              },
            },
          },
          orderBy: {
            match: {
              startTime: 'desc',
            },
          },
          take: 5,
        },
      },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return player;
  }

  async update(id: string, updatePlayerDto: UpdatePlayerDto) {
    const existingPlayer = await this.prisma.player.findUnique({
      where: { id },
      include: {
        session: true,
      },
    });

    if (!existingPlayer) {
      throw new NotFoundException('Player not found');
    }

    // Validate data based on session's requirePlayerInfo setting
    const { name, gender, level, confirmedByPlayer } = updatePlayerDto;

    if (confirmedByPlayer && existingPlayer.session.requirePlayerInfo) {
      if (!name || !gender || !level) {
        throw new BadRequestException(
          'Name, gender, and level are required for this session'
        );
      }
    }

    return this.prisma.player.update({
      where: { id },
      data: {
        name: updatePlayerDto.name,
        gender: updatePlayerDto.gender,
        level: updatePlayerDto.level,
        levelDescription: updatePlayerDto.levelDescription,
        phone: updatePlayerDto.phone,
        desire: updatePlayerDto.desire,
        confirmedByPlayer: updatePlayerDto.confirmedByPlayer,
        preFilledByHost: updatePlayerDto.preFilledByHost,
        requireConfirmInfo: updatePlayerDto.requireConfirmInfo,
      },
    });
  }

  async remove(id: string) {
    const existingPlayer = await this.prisma.player.findUnique({
      where: { id },
      include: {
        session: true,
      },
    });

    if (!existingPlayer) {
      throw new NotFoundException('Player not found');
    }

    // Prevent deletion if player is currently playing
    if (existingPlayer.status === 'PLAYING') {
      throw new BadRequestException(
        'Cannot delete a player who is currently playing'
      );
    }

    await this.prisma.player.delete({
      where: { id },
    });

    return { message: 'Player deleted successfully' };
  }

  async confirm(id: string, confirmPlayerDto: ConfirmPlayerDto) {
    const existingPlayer = await this.prisma.player.findUnique({
      where: { id },
      include: {
        session: true,
      },
    });

    if (!existingPlayer) {
      throw new NotFoundException('Player not found');
    }

    // For sessions requiring player info, validate data
    if (existingPlayer.session.requirePlayerInfo) {
      const { name, gender, level } = confirmPlayerDto;

      if (!name || !gender || !level) {
        throw new BadRequestException(
          'Name, gender, and level are required for this session'
        );
      }

      return this.prisma.player.update({
        where: { id },
        data: {
          name,
          gender,
          level,
          levelDescription: confirmPlayerDto.levelDescription,
          phone: confirmPlayerDto.phone,
          confirmedByPlayer: true,
          desire: confirmPlayerDto.desire,
        },
      });
    } else {
      // For sessions not requiring info, just confirm
      return this.prisma.player.update({
        where: { id },
        data: {
          name: confirmPlayerDto.name,
          gender: confirmPlayerDto.gender,
          level: confirmPlayerDto.level,
          levelDescription: confirmPlayerDto.levelDescription,
          phone: confirmPlayerDto.phone,
          desire: confirmPlayerDto.desire,
          confirmedByPlayer: true,
        },
      });
    }
  }

  async createInSession(sessionId: string, createPlayerDto: CreatePlayerDto) {
    // Validate session exists and get requiredLevels
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        requiredLevels: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const { playerNumber, level } = createPlayerDto;

    // Validate player level against session requiredLevels
    if (session.requiredLevels && session.requiredLevels.length > 0) {
      if (!level) {
        throw new BadRequestException(
          `This session requires players to have one of these levels: ${session.requiredLevels.join(', ')}. Please provide your level.`
        );
      }
      if (!session.requiredLevels.includes(level)) {
        throw new BadRequestException(
          `Your level (${level}) is not allowed in this session. Required levels: ${session.requiredLevels.join(', ')}`
        );
      }
    }

    // Check if player number already exists in this session
    const existingPlayer = await this.prisma.player.findFirst({
      where: {
        sessionId,
        playerNumber,
      },
    });

    if (existingPlayer) {
      throw new BadRequestException(
        'Player number already exists in this session'
      );
    }

    // Create player
    return this.prisma.player.create({
      data: {
        sessionId,
        playerNumber,
        name: createPlayerDto.name || null,
        gender: createPlayerDto.gender || null,
        level: createPlayerDto.level || null,
        levelDescription: createPlayerDto.levelDescription || null,
        phone: createPlayerDto.phone || null,
        userId: createPlayerDto.userId || null,
        joinCode: generatePlayerJoinCode(),
        preFilledByHost: createPlayerDto.preFilledByHost || false,
        confirmedByPlayer: createPlayerDto.confirmedByPlayer || false,
        requireConfirmInfo: createPlayerDto.requireConfirmInfo || false,
        status: 'WAITING',
      },
    });
  }

  async createBulkInSession(sessionId: string, playersData: CreatePlayerDto[]) {
    // Validate session exists
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        players: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session does not exist');
    }

    // Calculate max players allowed
    // const maxPlayers = session.numberOfCourts * session.maxPlayersPerCourt; // Unused variable removed

    // Validate player data
    const errors: string[] = [];
    const playerNumbers = new Set<number>();

    for (const [index, playerData] of playersData.entries()) {
      if (
        !playerData.playerNumber ||
        typeof playerData.playerNumber !== 'number'
      ) {
        errors.push(
          `Player ${index + 1}: playerNumber is required and must be a number`
        );
        continue;
      }

      // Check for duplicate playerNumber in request
      if (playerNumbers.has(playerData.playerNumber)) {
        errors.push(
          `Player ${index + 1}: playerNumber ${playerData.playerNumber} already exists in the request`
        );
        continue;
      }
      playerNumbers.add(playerData.playerNumber);

      // Check if playerNumber already exists in session
      const existingPlayer = session.players.find(
        (p) => p.playerNumber === playerData.playerNumber
      );
      if (existingPlayer) {
        errors.push(
          `Player ${index + 1}: playerNumber ${playerData.playerNumber} already exists in the session`
        );
        continue;
      }

      // Validate level against session's requiredLevels
      if (session.requiredLevels && session.requiredLevels.length > 0) {
        if (!playerData.level) {
          errors.push(
            `Player ${index + 1}: level is required. Required levels: ${session.requiredLevels.join(', ')}`
          );
        } else if (!session.requiredLevels.includes(playerData.level)) {
          errors.push(
            `Player ${index + 1}: level ${playerData.level} is not allowed. Required levels: ${session.requiredLevels.join(', ')}`
          );
        }
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(`Validation errors: ${errors.join('; ')}`);
    }

    // Create players
    const createdPlayers = await Promise.all(
      playersData.map((playerData) =>
        this.prisma.player.create({
          data: {
            sessionId,
            playerNumber: playerData.playerNumber,
            name: playerData.name || null,
            gender: playerData.gender || null,
            level: playerData.level || null,
            levelDescription: playerData.levelDescription || null,
            phone: playerData.phone || null,
            userId: playerData.userId || null,
            joinCode: generatePlayerJoinCode(),
            preFilledByHost: playerData.preFilledByHost || false,
            confirmedByPlayer: playerData.confirmedByPlayer || false,
            requireConfirmInfo: playerData.requireConfirmInfo || false,
            status: 'WAITING',
          },
        })
      )
    );

    // Get updated session
    const updatedSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    return {
      createdPlayers,
      session: updatedSession,
      message: `${createdPlayers.length} players created successfully`,
    };
  }

  async checkCode(code: string) {
    const player = await this.prisma.player.findUnique({
      where: { joinCode: code },
      select: { id: true },
    });

    return {
      isPlayerCode: !!player,
    };
  }

  // ============ Phase 4 Missing Endpoints ============

  async updatePlayerInSession(
    sessionId: string,
    playerId: string,
    updateData: {
      name?: string;
      gender?: Gender | null;
      level?: Level | null;
      levelDescription?: string;
      desire?: string;
      status?: PlayerStatus;
      preFilledByHost?: boolean;
      confirmedByPlayer?: boolean;
      requireConfirmInfo?: boolean;
    }
  ) {
    // Check if session exists
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Check if player exists in this session
    const existingPlayer = await this.prisma.player.findFirst({
      where: {
        id: playerId,
        sessionId: sessionId,
      },
    });

    if (!existingPlayer) {
      throw new NotFoundException('Player not found in this session');
    }

    // Validate name is required
    if (updateData.name !== undefined && updateData.name.trim() === '') {
      throw new BadRequestException('Player name is required');
    }

    // Update the player
    const updatedPlayer = await this.prisma.player.update({
      where: { id: playerId },
      data: {
        name: updateData.name?.trim() ?? existingPlayer.name,
        gender:
          updateData.gender !== undefined
            ? updateData.gender
            : existingPlayer.gender,
        level:
          updateData.level !== undefined
            ? updateData.level
            : existingPlayer.level,
        levelDescription:
          updateData.levelDescription ?? existingPlayer.levelDescription,
        desire: updateData.desire ?? existingPlayer.desire,
        status: updateData.status ?? existingPlayer.status,
        preFilledByHost:
          updateData.preFilledByHost !== undefined
            ? updateData.preFilledByHost
            : existingPlayer.preFilledByHost,
        confirmedByPlayer:
          updateData.confirmedByPlayer !== undefined
            ? updateData.confirmedByPlayer
            : existingPlayer.confirmedByPlayer,
        requireConfirmInfo:
          updateData.requireConfirmInfo !== undefined
            ? updateData.requireConfirmInfo
            : existingPlayer.requireConfirmInfo,
      },
    });

    return updatedPlayer;
  }

  async removePlayerFromSession(sessionId: string, playerId: string) {
    // Check if session exists
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Check if player exists in this session
    const existingPlayer = await this.prisma.player.findFirst({
      where: {
        id: playerId,
        sessionId: sessionId,
      },
    });

    if (!existingPlayer) {
      throw new NotFoundException('Player not found in this session');
    }

    // Check if player is currently playing
    if (existingPlayer.status === 'PLAYING') {
      throw new BadRequestException(
        'Cannot delete player who is currently playing. End their match first.'
      );
    }

    // Delete the player
    await this.prisma.player.delete({
      where: { id: playerId },
    });

    return { message: 'Player deleted successfully' };
  }

  async getPlayerStatistics(
    sessionId: string,
    options?: {
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      gender?: string;
      level?: string;
      status?: string;
    }
  ) {
    const {
      sortBy = 'playerNumber',
      sortOrder = 'asc',
      gender,
      level,
      status,
    } = options || {};

    // Validate session exists
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Build player filters
    const playerFilters: Record<string, unknown> = { sessionId };
    if (gender) (playerFilters as { gender?: string }).gender = gender;
    if (level) (playerFilters as { level?: string }).level = level;
    if (status) (playerFilters as { status?: string }).status = status;

    // Get all players in the session
    const players = await this.prisma.player.findMany({
      where: playerFilters,
    });

    // Get all matches in the session
    const matches = await this.prisma.match.findMany({
      where: { sessionId },
      include: {
        players: true,
      },
    });

    // Build statistics for each player
    const playerStats = players.map((player) => {
      // Matches played by this player
      const playedMatches = matches.filter((match) =>
        match.players.some((mp) => mp.playerId === player.id)
      );
      const totalMatches = playedMatches.length;

      // Count regular and extra matches
      const regularMatches = playedMatches.filter(
        (match) => !match.isExtra
      ).length;
      const extraMatches = playedMatches.filter(
        (match) => match.isExtra
      ).length;

      // Wins: player is in winning pair
      const wins = playedMatches.filter((match) => {
        if (!match.winnerIds) return false;
        try {
          const winnerIds =
            typeof match.winnerIds === 'string'
              ? (JSON.parse(match.winnerIds) as string[])
              : Array.isArray(match.winnerIds)
                ? (match.winnerIds as string[])
                : [];
          return Array.isArray(winnerIds) && winnerIds.includes(player.id);
        } catch {
          return false;
        }
      }).length;

      const losses = totalMatches - wins;
      const winRate =
        totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

      // Calculate total play time
      const totalPlayTime = playedMatches.reduce((total, match) => {
        if (match.startTime && match.endTime) {
          const duration = Math.round(
            (match.endTime.getTime() - match.startTime.getTime()) / (1000 * 60)
          );
          return total + duration;
        }
        return total;
      }, 0);

      return {
        playerId: player.id,
        playerNumber: player.playerNumber,
        name: player.name,
        gender: player.gender,
        level: player.level,
        totalMatches,
        regularMatches,
        extraMatches,
        wins,
        losses,
        winRate,
        averageScore: 0, // Simplified - would need score parsing
        totalPlayTime,
        totalWaitTime: player.totalWaitTime,
        status: player.status,
      };
    });

    // Sort the player statistics
    const sortedPlayerStats = playerStats.sort((a, b) => {
      const aValue = a[sortBy as keyof typeof a];
      const bValue = b[sortBy as keyof typeof b];

      // Handle string comparisons (case-insensitive)
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        if (aValue.toLowerCase() < bValue.toLowerCase()) {
          return sortOrder === 'asc' ? -1 : 1;
        }
        if (aValue.toLowerCase() > bValue.toLowerCase()) {
          return sortOrder === 'asc' ? 1 : -1;
        }
        return 0;
      }

      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return sortOrder === 'asc' ? 1 : -1;
      if (bValue == null) return sortOrder === 'asc' ? -1 : 1;

      // Compare values
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return {
      sessionId,
      playerStats: sortedPlayerStats,
      filters: {
        gender,
        level,
        status,
        sortBy,
        sortOrder,
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  async linkAccount(playerId: string, userId: string) {
    // TODO: Implement account linking feature
    void playerId;
    void userId;
    return Promise.reject(
      new BadRequestException('Account linking feature coming soon')
    );
  }

  // ============ Join By Code (Guest) ============

  async joinByCode(joinByCodeDto: {
    sessionCode: string;
    name: string;
    gender?: Gender;
    level?: Level;
    phone?: string;
  }) {
    const { sessionCode, name, gender, level, phone } = joinByCodeDto;

    // Find session by matching last 8 characters of sessionId with sessionCode
    const session = await this.prisma.session.findFirst({
      where: {
        id: {
          endsWith: sessionCode.toLowerCase(),
        },
        allowNewPlayers: true,
      },
      select: {
        id: true,
        name: true,
        status: true,
        numberOfCourts: true,
        maxPlayersPerCourt: true,
        allowNewPlayers: true,
        requirePlayerInfo: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (!session.allowNewPlayers) {
      throw new BadRequestException('Session does not allow new players');
    }

    // Get next player number
    const maxPlayerNumber = await this.prisma.player.findFirst({
      where: { sessionId: session.id },
      orderBy: { playerNumber: 'desc' },
      select: { playerNumber: true },
    });

    const nextPlayerNumber = (maxPlayerNumber?.playerNumber || 0) + 1;

    // Generate unique join code for new player
    let newJoinCode = generatePlayerJoinCode();
    while (
      await this.prisma.player.findUnique({ where: { joinCode: newJoinCode } })
    ) {
      newJoinCode = generatePlayerJoinCode();
    }

    // Create new player
    const newPlayer = await this.prisma.player.create({
      data: {
        sessionId: session.id,
        playerNumber: nextPlayerNumber,
        joinCode: newJoinCode,
        name,
        gender,
        level,
        phone,
        preFilledByHost: false,
        confirmedByPlayer: true,
        requireConfirmInfo: false,
        isJoined: true,
        isGuest: true,
        joinedAt: new Date(),
      },
    });

    return {
      player: {
        id: newPlayer.id,
        playerNumber: newPlayer.playerNumber,
        name: newPlayer.name,
        status: newPlayer.status,
        sessionId: newPlayer.sessionId,
        requireConfirmInfo: session.requirePlayerInfo,
        confirmedByPlayer: newPlayer.confirmedByPlayer,
        joinCode: newPlayer.joinCode,
      },
      session: {
        id: session.id,
        name: session.name,
        status: session.status,
        numberOfCourts: session.numberOfCourts,
        maxPlayersPerCourt: session.maxPlayersPerCourt,
      },
      message: `Successfully created as ${newPlayer.name} (Player ${newPlayer.playerNumber})`,
    };
  }

  // ============ Get Player Status by Guest Token ============

  async getPlayerStatus(guestToken: string) {
    // Parse guest token: guest_{sessionId}_{playerNumber}_{timestamp}
    const tokenParts = guestToken.split('_');
    if (tokenParts.length < 4 || tokenParts[0] !== 'guest') {
      throw new BadRequestException('Invalid guest token format');
    }

    const sessionId = tokenParts[1];
    const playerNumber = parseInt(tokenParts[2]);

    if (!sessionId || isNaN(playerNumber)) {
      throw new BadRequestException('Invalid guest token');
    }

    // Get player status
    const player = await this.prisma.player.findUnique({
      where: {
        sessionId_playerNumber: {
          sessionId,
          playerNumber,
        },
      },
      include: {
        session: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        currentCourt: {
          select: {
            id: true,
            courtNumber: true,
            courtName: true,
          },
        },
      },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    if (!player.isJoined) {
      throw new BadRequestException('Player slot not filled yet');
    }

    // Format response
    return {
      id: player.id,
      playerNumber: player.playerNumber,
      name: player.name,
      status: player.status,
      currentWaitTime: player.currentWaitTime,
      totalWaitTime: player.totalWaitTime,
      matchesPlayed: player.matchesPlayed,
      currentCourtId: player.currentCourt?.courtNumber,
      courtName: player.currentCourt?.courtName,
      session: player.session,
      joinedAt: player.joinedAt,
    };
  }

  async getMySessions(userId: string) {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    // Find all sessions that the current user has participated in
    const sessions = await this.prisma.session.findMany({
      where: {
        players: {
          some: {
            userId: userId,
            // isJoined: true, // Only get sessions where user actually joined
          },
        },
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            players: {
              where: {
                isJoined: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return sessions;
  }
}
