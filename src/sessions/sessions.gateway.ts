import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

// Event types for realtime updates
export enum SessionEventType {
  SESSION_UPDATED = 'session_updated',
  PLAYER_CREATED = 'player_created',
  PLAYER_UPDATED = 'player_updated',
  PLAYER_REMOVED = 'player_removed',
  COURT_UPDATED = 'court_updated',
  MATCH_STARTED = 'match_started',
  MATCH_ENDED = 'match_ended',
  PLAYERS_SELECTED = 'players_selected',
  PLAYERS_DESELECTED = 'players_deselected',
  REGISTRATION_REQUEST = 'registration_request',
  REGISTRATION_STATUS_UPDATED = 'registration_status_updated',
  NOTIFICATION_RECEIVED = 'notification_received',
  // Session lifecycle events
  SESSION_START_REMINDER = 'session_start_reminder',
  SESSION_END_WARNING = 'session_end_warning',
  SESSION_OVERTIME = 'session_overtime',
  SESSION_CANCELLED = 'session_cancelled',
  SESSION_STARTED = 'session_started',
}

@WebSocketGateway({
  cors: {
    origin: '*', // Allow all origins for now
  },
  namespace: '/sessions', // Namespace to separate from other potential gateways
})
export class SessionsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private logger: Logger = new Logger('SessionsGateway');

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const userId = (client.data as { userId?: string }).userId;
    this.logger.log(
      `Client disconnected: ${client.id}${userId ? ` (user: ${userId})` : ''}`
    );

    // Clean up: leave all user rooms on disconnect
    const currentRooms = Array.from(client.rooms);
    for (const room of currentRooms) {
      if (room.startsWith('user-')) {
        void client.leave(room);
        this.logger.log(
          `Socket ${client.id} auto-left user room ${room} on disconnect`
        );
      }
    }
  }

  @SubscribeMessage('joinSession')
  async handleJoinSession(
    @MessageBody() sessionId: string,
    @ConnectedSocket() client: Socket
  ) {
    const roomName = `session_${sessionId}`;
    await client.join(roomName);
    this.logger.log(`Client ${client.id} joined room ${roomName}`);
    return { event: 'joinedSession', data: { sessionId } };
  }

  @SubscribeMessage('leaveSession')
  async handleLeaveSession(
    @MessageBody() sessionId: string,
    @ConnectedSocket() client: Socket
  ) {
    const roomName = `session_${sessionId}`;
    await client.leave(roomName);
    this.logger.log(`Client ${client.id} left room ${roomName}`);
    return { event: 'leftSession', data: { sessionId } };
  }

  @SubscribeMessage('join_user_room')
  async handleJoinUserRoom(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket
  ) {
    // Extract and verify the token from the socket handshake
    const authToken = (client.handshake.auth as { token?: string }).token;
    const authHeader = client.handshake.headers.authorization;
    const token = (authToken ?? authHeader)?.replace(/^Bearer\s+/i, '');

    if (!token) {
      this.logger.warn(
        `Socket ${client.id} attempted to join user room without auth token`
      );
      return { error: 'Authentication required' };
    }

    let authenticatedUserId: string;
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      authenticatedUserId = payload.sub;
    } catch {
      this.logger.warn(
        `Socket ${client.id} provided an invalid or expired token`
      );
      return { error: 'Invalid or expired token' };
    }

    // Ignore the client-supplied userId; use the authenticated one
    if (data?.userId && data.userId !== authenticatedUserId) {
      this.logger.warn(
        `Socket ${client.id} supplied userId ${data.userId} does not match authenticated userId ${authenticatedUserId}. Using authenticated userId.`
      );
    }

    const roomName = `user-${authenticatedUserId}`;

    // Leave ALL user rooms to prevent leakage
    const currentRooms = Array.from(client.rooms);
    for (const room of currentRooms) {
      if (room.startsWith('user-')) {
        await client.leave(room);
        this.logger.log(`Socket ${client.id} left user room ${room}`);
      }
    }

    // Store verified userId in socket data
    (client.data as { userId?: string }).userId = authenticatedUserId;

    await client.join(roomName);
    this.logger.log(
      `[Socket] User ${authenticatedUserId} joined room ${roomName} (socket: ${client.id})`
    );

    return {
      event: 'joinedUserRoom',
      data: { userId: authenticatedUserId },
    };
  }

  /**
   * Notify all clients in a session about an update (legacy method, kept for backward compatibility)
   */
  notifySessionUpdate(sessionId: string) {
    this.notifyEvent(sessionId, SessionEventType.SESSION_UPDATED);
  }

  /**
   * Notify all clients in a session about a specific event
   * @param sessionId - The session ID
   * @param eventType - The type of event
   * @param payload - Optional additional data to send with the event
   */
  notifyEvent(
    sessionId: string,
    eventType: SessionEventType,
    payload?: Record<string, unknown>
  ) {
    const roomName = `session_${sessionId}`;
    this.server.to(roomName).emit(eventType, { sessionId, ...payload });
    this.logger.log(
      `Notified ${eventType} for session ${sessionId}${payload ? ` with payload: ${JSON.stringify(payload)}` : ''}`
    );
  }

  /**
   * Notify a specific user about an event
   * @param userId - The user ID
   * @param eventType - The type of event
   * @param payload - Optional additional data to send with the event
   */
  notifyUser(
    userId: string,
    eventType: SessionEventType,
    payload?: Record<string, unknown>
  ) {
    if (!userId) {
      this.logger.warn(`[Realtime] Attempted to notify user with empty userId`);
      return;
    }

    const roomName = `user-${userId}`;
    const targetedPayload = { ...(payload ?? {}), userId };

    void this.server
      .in(roomName)
      .fetchSockets()
      .then((sockets) => {
        let validSocketCount = 0;

        for (const socket of sockets) {
          // Verify socket belongs to the target user before emitting.
          if ((socket.data as { userId?: string }).userId === userId) {
            socket.emit(eventType, targetedPayload);
            validSocketCount++;
            continue;
          }

          // Socket in wrong room - force leave and never emit to it.
          this.logger.warn(
            `[Security] Socket ${socket.id} (user: ${(socket.data as { userId?: string }).userId}) found in wrong room ${roomName}. Removing.`
          );
          socket.leave(roomName);
        }

        if (validSocketCount > 0) {
          this.logger.log(
            `[Realtime] Notified user ${userId} of ${eventType} (${validSocketCount} socket(s))`
          );
        }
      })
      .catch((error) => {
        this.logger.error(
          `[Realtime] Failed to notify user ${userId} of ${eventType}`,
          error
        );
      });
  }
}
