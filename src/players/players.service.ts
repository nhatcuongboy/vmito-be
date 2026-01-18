import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { ConfirmPlayerDto } from './dto/confirm-player.dto';
import { generatePlayerJoinCode } from './utils/player-helpers';
import { Gender, PlayerStatus, RegistrationStatus } from '@prisma/client';
import {
  SessionsGateway,
  SessionEventType,
} from '../sessions/sessions.gateway';

@Injectable()
export class PlayersService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => SessionsGateway))
    private sessionsGateway: SessionsGateway
  ) {}

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

    const updatedPlayer = await this.prisma.player.update({
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

    // Emit realtime event
    this.sessionsGateway.notifyEvent(
      existingPlayer.sessionId,
      SessionEventType.PLAYER_UPDATED,
      { playerId: id }
    );

    return updatedPlayer;
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

    // Emit realtime event
    this.sessionsGateway.notifyEvent(
      existingPlayer.sessionId,
      SessionEventType.PLAYER_REMOVED,
      { playerId: id }
    );

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
    const newPlayer = await this.prisma.player.create({
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
        waitingSince: new Date(), // Set waitingSince for realtime wait time calculation
      },
    });

    // Emit realtime event
    this.sessionsGateway.notifyEvent(
      sessionId,
      SessionEventType.PLAYER_CREATED,
      { playerId: newPlayer.id }
    );

    return newPlayer;
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
            waitingSince: new Date(), // Set waitingSince for realtime wait time calculation
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

  async getBulkPlayersInfo(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        players: {
          select: { playerNumber: true },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const maxPlayers = session.numberOfCourts * session.maxPlayersPerCourt;
    const existingPlayerNumbers = session.players.map((p) => p.playerNumber);
    const availablePlayerNumbers: number[] = [];

    for (let i = 1; i <= maxPlayers; i++) {
      if (!existingPlayerNumbers.includes(i)) {
        availablePlayerNumbers.push(i);
      }
    }

    return {
      sessionId: session.id,
      sessionName: session.name,
      maxPlayers,
      currentPlayersCount: session.players.length,
      availableSlots: maxPlayers - session.players.length,
      availablePlayerNumbers,
      existingPlayerNumbers,
    };
  }

  async bulkUpdatePlayers(
    sessionId: string,
    players: Array<{
      id?: string;
      name?: string;
      gender?: Gender | null;
      level?: number | null;
      levelDescription?: string;
      desire?: string;
      status?: PlayerStatus;
      preFilledByHost?: boolean;
      confirmedByPlayer?: boolean;
      requireConfirmInfo?: boolean;
    }>
  ) {
    // Check if session exists
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Validate that all players have an id
    for (const player of players) {
      if (!player.id) {
        throw new BadRequestException('All players must have an id');
      }
    }

    // Update all players in parallel
    const updatedPlayers = await Promise.all(
      players.map(async (playerData) => {
        const { id, ...updateData } = playerData;

        // Verify player belongs to this session
        const existingPlayer = await this.prisma.player.findFirst({
          where: { id, sessionId },
        });

        if (!existingPlayer) {
          throw new NotFoundException(`Player ${id} not found in this session`);
        }

        return this.prisma.player.update({
          where: { id },
          data: updateData,
        });
      })
    );

    // Emit realtime event
    this.sessionsGateway.notifyEvent(
      sessionId,
      SessionEventType.PLAYER_UPDATED,
      { bulkUpdate: true, count: updatedPlayers.length }
    );

    return { updatedPlayers };
  }

  async registerPlayers(
    sessionId: string,
    currentUserId: string,
    playersData: CreatePlayerDto[]
  ) {
    // Validate session exists
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        hostId: true,
        requiredLevels: true,
        players: {
          select: { playerNumber: true },
        },
      },
      // Note: we need existing players to check for duplicates, which createdBulkInSession did via include: { players: true }
      // But let's follow the pattern or optimized one.
      // createBulkInSession used include: { players: true } to check duplicates in memory.
    });

    if (!session) {
      throw new NotFoundException('Session does not exist');
    }

    // Determine initial status
    // If request is from Host -> APPROVED
    // If request is from User -> PENDING (unless we add logic to auto-approve)
    const isHost = session.hostId === currentUserId;
    const registrationStatus: RegistrationStatus = isHost
      ? 'APPROVED'
      : 'PENDING';

    // Validate player data
    const errors: string[] = [];
    const playerNumbers = new Set<number>();

    // Get existing player numbers
    // Ideally we should re-fetch `session.players` if we didn't include it fully,
    // but the query above `select: { players: ... }` works but returns array of objects.
    // Let's stick to consistent validation style.
    // Re-fetch full session players for validation compatibility with createBulk logic or use what we have.
    // createBulkInSession fetches `include: { players: true }`. Let's do that for simplicity and consistency.

    // Re-query to get full player list for duplicate check
    const fullSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { players: true },
    });

    if (!fullSession) throw new NotFoundException('Session not found');

    for (const [index, playerData] of playersData.entries()) {
      // Basic validation
      if (
        !playerData.playerNumber ||
        typeof playerData.playerNumber !== 'number'
      ) {
        errors.push(`Player ${index + 1}: playerNumber is required`);
        continue;
      }

      // Check for duplicate in request
      if (playerNumbers.has(playerData.playerNumber)) {
        errors.push(
          `Player ${index + 1}: Duplicate player number ${playerData.playerNumber} in request`
        );
        continue;
      }
      playerNumbers.add(playerData.playerNumber);

      // Check for duplicate in session
      if (
        fullSession.players.some(
          (p) => p.playerNumber === playerData.playerNumber
        )
      ) {
        errors.push(
          `Player ${index + 1}: Player number ${playerData.playerNumber} already exists in session`
        );
        continue;
      }

      // Validate Level
      if (fullSession.requiredLevels && fullSession.requiredLevels.length > 0) {
        if (!playerData.level) {
          errors.push(`Player ${index + 1}: Level required`);
        } else if (!fullSession.requiredLevels.includes(playerData.level)) {
          errors.push(
            `Player ${index + 1}: Level ${playerData.level} not allowed`
          );
        }
      }

      // Validate UserId linkage
      if (playerData.userId) {
        if (playerData.userId !== currentUserId) {
          errors.push(`Player ${index + 1}: Cannot register for another user`);
        }
        // Check if user is already in session?
        // Only check if it's the SAME session.
        const alreadyJoined = fullSession.players.some(
          (p) =>
            p.userId === currentUserId && p.registrationStatus !== 'REJECTED'
        );
        if (alreadyJoined) {
          errors.push(`You have already registered for this session`);
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
            registrationStatus: registrationStatus,
            waitingSince: new Date(),
          },
        })
      )
    );

    // Notify
    // We should probably have a specific event for REGISTER?
    // Or just PLAYER_CREATED is fine, but maybe frontend needs to know it's pending.
    // existing PLAYER_CREATED event sends payload with playerId.
    // Host will see it.

    for (const player of createdPlayers) {
      this.sessionsGateway.notifyEvent(
        sessionId,
        SessionEventType.PLAYER_CREATED,
        { playerId: player.id, registrationStatus }
      );
    }

    // If PENDING, maybe notify Host specifically? (TODO)

    return {
      createdPlayers,
      message: isHost
        ? 'Players added successfully'
        : 'Registration submitted successfully',
    };
  }

  async updatePlayerStatus(
    sessionId: string,
    playerId: string,
    status: 'APPROVED' | 'REJECTED',
    currentUserId: string
  ) {
    // Check if session exists and user is Host
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { hostId: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.hostId !== currentUserId) {
      throw new ForbiddenException('Only the host can approve/reject players');
    }

    // Check if player is in this session
    const existingPlayer = await this.prisma.player.findFirst({
      where: { id: playerId, sessionId },
    });

    if (!existingPlayer) {
      throw new NotFoundException('Player not found in this session');
    }

    // Update status
    const updatedPlayer = await this.prisma.player.update({
      where: { id: playerId },
      data: {
        registrationStatus: status,
        // If Approved, effectively they are Waiting to play.
        // If Rejected, they stay in DB but marked Rejected.
      },
    });

    // Notify
    this.sessionsGateway.notifyEvent(
      sessionId,
      SessionEventType.PLAYER_UPDATED,
      { playerId, registrationStatus: status }
    );

    return updatedPlayer;
  }

  async findPendingRequests(hostId: string) {
    return this.prisma.player.findMany({
      where: {
        registrationStatus: 'PENDING',
        session: {
          hostId: hostId,
          // Only show for future sessions? Maybe.
          // status: { not: 'FINISHED' }
        },
      },
      include: {
        session: {
          select: { name: true, startTime: true },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async checkCode(code: string) {
    const player = await this.prisma.player.findUnique({
      where: { joinCode: code },
      select: { id: true, sessionId: true },
    });

    return {
      isPlayerCode: !!player,
      playerId: player?.id || null,
      sessionId: player?.sessionId || null,
    };
  }

  async getPlayerForGuest(playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        playerNumber: true,
        name: true,
        gender: true,
        level: true,
        levelDescription: true,
        phone: true,
        desire: true,
        confirmedByPlayer: true,
        requireConfirmInfo: true,
        joinCode: true,
        session: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return player;
  }

  async getPlayerStatusById(playerId: string, joinCode: string) {
    if (!joinCode) {
      throw new BadRequestException('Join code is required');
    }

    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        joinCode: true,
        sessionId: true,
      },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    if (player.joinCode !== joinCode) {
      throw new ForbiddenException('Invalid join code');
    }

    // Fetch full session data for guest
    const session = await this.prisma.session.findUnique({
      where: { id: player.sessionId },
      include: {
        courts: {
          include: {
            currentMatch: {
              include: {
                players: {
                  include: {
                    player: true,
                  },
                },
              },
            },
            currentPlayers: true,
          },
          orderBy: { courtNumber: 'asc' },
        },
        players: {
          include: {
            currentCourt: true,
          },
          orderBy: { playerNumber: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return {
      playerId: player.id,
      sessionId: player.sessionId,
      verified: true,
      session,
    };
  }

  // ============ Phase 4 Missing Endpoints ============

  async toggleInactive(sessionId: string, playerId: string) {
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

    // Determine new status
    // If player is INACTIVE, switch to WAITING
    // Otherwise switch to INACTIVE
    let newStatus: PlayerStatus = 'INACTIVE';
    if (existingPlayer.status === 'INACTIVE') {
      newStatus = 'WAITING';
    } else {
      newStatus = 'INACTIVE';
    }

    // Check if player is currently playing before setting to inactive
    if (newStatus === 'INACTIVE' && existingPlayer.status === 'PLAYING') {
      throw new BadRequestException(
        'Cannot set player to inactive while they are playing'
      );
    }

    // Update player status
    const updatedPlayer = await this.prisma.player.update({
      where: { id: playerId },
      data: {
        status: newStatus,
        // Set waitingSince when returning to WAITING, clear when going inactive
        waitingSince: newStatus === 'WAITING' ? new Date() : null,
      },
    });

    // Emit realtime event
    this.sessionsGateway.notifyEvent(
      sessionId,
      SessionEventType.PLAYER_UPDATED,
      { playerId }
    );

    return updatedPlayer;
  }

  async updatePlayerInSession(
    sessionId: string,
    playerId: string,
    updateData: {
      name?: string;
      gender?: Gender | null;
      level?: number | null;
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

      // Losses: Match is decisive (has winners, not draw) AND player is not a winner
      const losses = playedMatches.filter((match) => {
        // If it's a draw, it's not a loss
        if (match.isDraw) return false;

        let winnerIds: string[] = [];
        if (match.winnerIds) {
          try {
            winnerIds =
              typeof match.winnerIds === 'string'
                ? (JSON.parse(match.winnerIds) as string[])
                : Array.isArray(match.winnerIds)
                  ? (match.winnerIds as string[])
                  : [];
          } catch {
            // If parsing fails, assume no valid winners
            return false;
          }
        }

        // If no winners recorded, it's a "no result" match, not a loss
        if (!winnerIds || winnerIds.length === 0) return false;

        // It is a loss if there ARE winners but player is not one of them
        return !winnerIds.includes(player.id);
      }).length;

      // Note: winRate is calculated based on decisive matches or total matches?
      // Usually Win Rate = Wins / Total Matches * 100.
      // If we keep "Total Matches" as denominator, Win Rate will define "winning percentage out of all games played".
      // If we want "winning percentage excluding draws/no-results", denominator should be (wins + losses).
      // Given the current simple UI, keeping Total Matches as denominator is safer/standard,
      // but users might wonder why Wins + Losses != Total Matches.
      // However, correcting "Losses" is the priority.

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
    level?: number;
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
        players: {
          where: { userId: userId },
          select: {
            id: true,
            status: true,
            registrationStatus: true,
            playerNumber: true,
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
