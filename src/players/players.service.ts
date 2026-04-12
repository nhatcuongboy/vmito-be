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
import {
  Gender,
  PlayerStatus,
  RegistrationStatus,
  Prisma,
} from '@prisma/client';
import { removeVietnameseTones } from '../common/utils/string.utils';
import {
  SessionsGateway,
  SessionEventType,
} from '../sessions/sessions.gateway';
import { FeeService } from '../fee/fee.service';

@Injectable()
export class PlayersService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => SessionsGateway))
    private sessionsGateway: SessionsGateway,
    private feeService: FeeService
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
        isClubMember: updatePlayerDto.isClubMember,
        clubId: updatePlayerDto.clubId,
      },
    });

    // Emit realtime event
    this.sessionsGateway.notifyEvent(
      existingPlayer.sessionId,
      SessionEventType.PLAYER_UPDATED,
      { playerId: id }
    );

    // Recalculate payment if any relevant field might have changed
    await this.feeService.recalculatePlayerPayment(
      existingPlayer.sessionId,
      id
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
        hostId: true,
        requiredLevels: true,
        players: {
          select: { playerNumber: true },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    let { playerNumber } = createPlayerDto;
    const { level } = createPlayerDto;

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

    // Determine player number
    if (!playerNumber) {
      const existingNumbers = session.players.map((p) => p.playerNumber);
      playerNumber = this.getNextAvailablePlayerNumber(
        existingNumbers,
        new Set()
      );
    } else {
      // Check if player number already exists in this session
      const numberExists = session.players.some(
        (p) => p.playerNumber === playerNumber
      );

      if (numberExists) {
        throw new BadRequestException(
          'Player number already exists in this session'
        );
      }
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

    // Create payment record if session has fee config
    await this.feeService.createPaymentRecordForPlayer(
      sessionId,
      newPlayer.id,
      session.hostId
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
    const providedNumbers = new Set<number>();

    // First pass: Validate provided data
    for (const [index, playerData] of playersData.entries()) {
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

      if (playerData.playerNumber) {
        // Check for duplicate playerNumber in request
        if (providedNumbers.has(playerData.playerNumber)) {
          errors.push(
            `Player ${index + 1}: playerNumber ${playerData.playerNumber} already exists in the request`
          );
        }
        providedNumbers.add(playerData.playerNumber);

        // Check if playerNumber already exists in session
        const existingPlayer = session.players.find(
          (p) => p.playerNumber === playerData.playerNumber
        );
        if (existingPlayer) {
          errors.push(
            `Player ${index + 1}: playerNumber ${playerData.playerNumber} already exists in the session`
          );
        }
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(`Validation errors: ${errors.join('; ')}`);
    }

    // Second pass: Assign numbers and create
    const existingSessionNumbers = session.players.map((p) => p.playerNumber);
    const currentlyTakenNumbers = new Set([
      ...existingSessionNumbers,
      ...Array.from(providedNumbers),
    ]);

    // Create players
    const createdPlayers = await Promise.all(
      playersData.map((playerData) => {
        let playerNumber = playerData.playerNumber;

        if (!playerNumber) {
          playerNumber = this.getNextAvailablePlayerNumber(
            [],
            currentlyTakenNumbers
          );
          currentlyTakenNumbers.add(playerNumber);
        }

        return this.prisma.player.create({
          data: {
            sessionId,
            playerNumber: playerNumber,
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
            isClubMember: playerData.isClubMember || false,
            clubId: playerData.clubId || null,
            status: 'WAITING',
            waitingSince: new Date(),
          },
        });
      })
    );

    // Get updated session
    const updatedSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    // Create payment records for all created players
    await Promise.all(
      createdPlayers.map((p) =>
        this.feeService.createPaymentRecordForPlayer(
          sessionId,
          p.id,
          session.hostId
        )
      )
    );

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
      isClubMember?: boolean;
      clubId?: string;
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

    // Recalculate payments for all updated players
    await Promise.all(
      updatedPlayers.map((p) =>
        this.feeService.recalculatePlayerPayment(sessionId, p.id)
      )
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
    playersData: CreatePlayerDto[],
    role?: string
  ) {
    // Validate session exists
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        name: true,
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
    const registrationStatus: RegistrationStatus =
      isHost || role === 'ADMIN' ? 'APPROVED' : 'PENDING';

    // Re-query to get full player list for duplicate check
    const fullSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { players: true },
    });

    if (!fullSession) throw new NotFoundException('Session not found');

    // Validate player data
    const errors: string[] = [];

    // First pass: Validation
    for (const [index, playerData] of playersData.entries()) {
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

      // ValidateUserId linkage
      if (playerData.userId) {
        if (playerData.userId !== currentUserId) {
          errors.push(`Player ${index + 1}: Cannot register for another user`);
        }
        const alreadyJoined = fullSession.players.some(
          (p) =>
            p.userId === currentUserId && p.registrationStatus !== 'REJECTED'
        );
        if (alreadyJoined) {
          errors.push(`You have already registered for this session`);
        }
      }

      // Note: playerNumber validation removed - backend will auto-assign available numbers
    }

    if (errors.length > 0) {
      throw new BadRequestException(`Validation errors: ${errors.join('; ')}`);
    }

    // Second pass: Assignment and create
    const existingSessionNumbers = fullSession.players.map(
      (p) => p.playerNumber
    );
    const currentlyTakenNumbers = new Set([...existingSessionNumbers]);

    // Create players with auto-assigned numbers
    const createdPlayers = await Promise.all(
      playersData.map((playerData) => {
        let playerNumber = playerData.playerNumber;

        // Auto-assign if not provided OR if already taken
        if (!playerNumber || currentlyTakenNumbers.has(playerNumber)) {
          playerNumber = this.getNextAvailablePlayerNumber(
            [],
            currentlyTakenNumbers
          );
        }
        currentlyTakenNumbers.add(playerNumber);

        return this.prisma.player.create({
          data: {
            sessionId,
            playerNumber,
            name: playerData.name || null,
            gender: playerData.gender || null,
            level: playerData.level || null,
            levelDescription: playerData.levelDescription || null,
            phone: playerData.phone || null,
            userId: playerData.userId || null,
            createdByUserId: currentUserId, // Track who created this player
            joinCode: generatePlayerJoinCode(),
            preFilledByHost: playerData.preFilledByHost || false,
            confirmedByPlayer: playerData.confirmedByPlayer || false,
            requireConfirmInfo: playerData.requireConfirmInfo || false,
            isClubMember: playerData.isClubMember || false,
            clubId: playerData.clubId || null,
            status: 'WAITING',
            registrationStatus: registrationStatus,
            waitingSince: new Date(),
          },
        });
      })
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

    // Notify Host if there are pending registrations
    if (registrationStatus === 'PENDING') {
      const pendingPlayerNames = createdPlayers
        .map((p) => p.name || 'Guest')
        .join(', ');
      this.sessionsGateway.notifyUser(
        session.hostId,
        SessionEventType.REGISTRATION_REQUEST,
        {
          sessionId,
          sessionName: session.name || 'Badminton Session',
          playerName: pendingPlayerNames,
          count: createdPlayers.length,
        }
      );
    }

    // Create payment records for registered players
    await Promise.all(
      createdPlayers.map((p) =>
        this.feeService.createPaymentRecordForPlayer(
          sessionId,
          p.id,
          session.hostId
        )
      )
    );

    return {
      createdPlayers,
      message: isHost ? 'Đăng ký slot thành công' : 'Đăng ký slot thành công',
    };
  }

  async updatePlayerStatus(
    sessionId: string,
    playerId: string,
    status: 'APPROVED' | 'REJECTED',
    currentUserId: string,
    role?: string
  ) {
    // Check if session exists and user is Host
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { hostId: true, name: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.hostId !== currentUserId && role !== 'ADMIN') {
      throw new ForbiddenException(
        'Only the host or admin can approve/reject players'
      );
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

    // Notify User specifically about their status update
    if (existingPlayer.userId) {
      this.sessionsGateway.notifyUser(
        existingPlayer.userId,
        SessionEventType.REGISTRATION_STATUS_UPDATED,
        {
          sessionId,
          sessionName: session.name || 'Badminton Session',
          status,
          playerId,
        }
      );
    }

    // If Approved, create payment record if session has fee config
    if (status === 'APPROVED') {
      await this.feeService.createPaymentRecordForPlayer(
        sessionId,
        playerId,
        session.hostId
      );
    }

    return updatedPlayer;
  }

  async findPendingRequests(
    hostId: string,
    role?: string,
    page = 1,
    limit = 20
  ) {
    const where: Prisma.PlayerWhereInput = {
      registrationStatus: 'PENDING',
    };

    if (role !== 'ADMIN') {
      where.session = {
        hostId: hostId,
      };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.player.findMany({
        where,
        include: {
          session: {
            select: {
              id: true,
              name: true,
              startTime: true,
              venue: { select: { name: true } },
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        skip,
        take: limit,
      }),
      this.prisma.player.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async countPendingRequests(hostId: string, role?: string) {
    const where: Prisma.PlayerWhereInput = {
      registrationStatus: 'PENDING',
    };

    if (role !== 'ADMIN') {
      where.session = {
        hostId: hostId,
      };
    }

    const count = await this.prisma.player.count({ where });
    return { count };
  }

  async batchUpdatePlayerStatus(
    playerIds: string[],
    status: 'APPROVED' | 'REJECTED',
    currentUserId: string,
    role?: string
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Fetch all players with their sessions
      const players = await tx.player.findMany({
        where: {
          id: { in: playerIds },
          registrationStatus: 'PENDING',
        },
        include: {
          session: { select: { id: true, hostId: true, name: true } },
        },
      });

      if (players.length === 0) {
        throw new NotFoundException('No pending players found');
      }

      // Verify authorization for all sessions
      if (role !== 'ADMIN') {
        const unauthorized = players.find(
          (p) => p.session.hostId !== currentUserId
        );
        if (unauthorized) {
          throw new ForbiddenException(
            'Only the host or admin can approve/reject players'
          );
        }
      }

      // Batch update
      await tx.player.updateMany({
        where: { id: { in: playerIds } },
        data: { registrationStatus: status },
      });

      // Send notifications and create payment records per player
      for (const player of players) {
        this.sessionsGateway.notifyEvent(
          player.sessionId,
          SessionEventType.PLAYER_UPDATED,
          { playerId: player.id, registrationStatus: status }
        );

        if (player.userId) {
          this.sessionsGateway.notifyUser(
            player.userId,
            SessionEventType.REGISTRATION_STATUS_UPDATED,
            {
              sessionId: player.sessionId,
              sessionName: player.session.name || 'Badminton Session',
              status,
              playerId: player.id,
            }
          );
        }

        if (status === 'APPROVED') {
          await this.feeService.createPaymentRecordForPlayer(
            player.sessionId,
            player.id,
            player.session.hostId
          );
        }
      }

      return { updated: players.length, status };
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
      isClubMember?: boolean;
      clubId?: string;
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
        isClubMember:
          updateData.isClubMember !== undefined
            ? updateData.isClubMember
            : existingPlayer.isClubMember,
        clubId:
          updateData.clubId !== undefined
            ? updateData.clubId
            : existingPlayer.clubId,
      },
    });

    // Recalculate payment
    await this.feeService.recalculatePlayerPayment(sessionId, playerId);

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
    const playerFilters: Record<string, unknown> = {
      sessionId,
      registrationStatus: 'APPROVED',
    };
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

  async getMySessions(
    userId: string,
    filters?: {
      page?: number;
      limit?: number;
      searchQuery?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      status?: string;
    }
  ) {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 12;
    const skip = (page - 1) * limit;

    // Find all sessions that the current user has registered for (Pending/Approved)
    const where: Prisma.SessionWhereInput = {
      players: {
        some: {
          userId: userId,
          registrationStatus: {
            in: ['PENDING', 'APPROVED'],
          },
        },
      },
    };

    if (filters?.status) {
      where.status = filters.status as any;
    }

    if (filters?.searchQuery) {
      const searchTerm = removeVietnameseTones(
        filters.searchQuery
      ).toLowerCase();
      where.OR = [
        { searchTerms: { contains: searchTerm, mode: 'insensitive' } },
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { location: { contains: searchTerm, mode: 'insensitive' } },
        { venue: { name: { contains: searchTerm, mode: 'insensitive' } } },
        { venue: { address: { contains: searchTerm, mode: 'insensitive' } } },
      ];
    }

    // Build orderBy
    const isStatusSort = filters?.sortBy === 'status';
    const buildOrderBy = (): Prisma.SessionOrderByWithRelationInput | Prisma.SessionOrderByWithRelationInput[] => {
      const order = (filters?.sortOrder || 'asc') as Prisma.SortOrder;
      switch (filters?.sortBy) {
        case 'date':
          return { startTime: order };
        case 'created':
          return { createdAt: order };
        case 'price':
          return { feeConfig: { maleFee: order } };
        case 'status':
          // Status sort handled post-fetch (custom priority: IN_PROGRESS -> PREPARING -> FINISHED)
          return { startTime: 'asc' };
        default:
          return { createdAt: 'desc' };
      }
    };

    const [sessions, total] = await Promise.all([
      this.prisma.session.findMany({
        where,
        include: {
          host: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          feeConfig: true,
          _count: {
            select: {
              players: {
                where: {
                  isJoined: true,
                },
              },
            },
          },
          courts: {
            orderBy: { courtNumber: 'asc' },
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
        orderBy: buildOrderBy(),
        // For status sort, fetch all then sort + paginate in JS
        ...(isStatusSort ? {} : { skip, take: limit }),
      }),
      this.prisma.session.count({ where }),
    ]);

    if (isStatusSort) {
      // Custom status priority: IN_PROGRESS -> PREPARING -> FINISHED
      const statusPriority: Record<string, number> = {
        IN_PROGRESS: 0,
        PREPARING: 1,
        FINISHED: 2,
      };
      const sorted = [...sessions].sort((a, b) => {
        const orderA = statusPriority[a.status] ?? 3;
        const orderB = statusPriority[b.status] ?? 3;
        if (orderA !== orderB) return orderA - orderB;
        const dateA = a.startTime ? new Date(a.startTime).getTime() : 0;
        const dateB = b.startTime ? new Date(b.startTime).getTime() : 0;
        return dateA - dateB;
      });
      return {
        data: sorted.slice(skip, skip + limit),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    return {
      data: sessions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserRegistrations(userId: string) {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    // Find all player registrations for the user
    const players = await this.prisma.player.findMany({
      where: {
        userId: userId,
        registrationStatus: {
          in: ['PENDING', 'APPROVED', 'REJECTED'],
        },
      },
      select: {
        id: true,
        sessionId: true,
        registrationStatus: true,
      },
    });

    // Return unique sessions (deduplicate by sessionId)
    const uniqueSessions = Array.from(
      new Map(
        players.map((p) => [
          p.sessionId,
          {
            sessionId: p.sessionId,
            playerId: p.id,
            status: p.registrationStatus,
          },
        ])
      ).values()
    );

    return uniqueSessions;
  }

  async getMyPlayersForSession(sessionId: string, userId: string) {
    if (!sessionId || !userId) {
      throw new BadRequestException('Session ID and User ID are required');
    }

    // Find all players that the user registered for this session
    // This includes:
    // 1. Players where userId matches (the user themselves)
    // 2. Players where createdByUserId matches (guests they registered)
    const players = await this.prisma.player.findMany({
      where: {
        sessionId: sessionId,
        OR: [{ userId: userId }, { createdByUserId: userId }],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        level: true,
        gender: true,
        playerNumber: true,
        registrationStatus: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return players;
  }

  private getNextAvailablePlayerNumber(
    existingNumbers: number[],
    requestedNumbers: Set<number> // Updated to Set<number>
  ): number {
    let candidate = 1;
    while (
      existingNumbers.includes(candidate) ||
      requestedNumbers.has(candidate)
    ) {
      candidate++;
    }
    return candidate;
  }
}
