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
  server: Server;

  private logger: Logger = new Logger('SessionsGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
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
    if (!data?.userId) return;

    const roomName = `user-${data.userId}`;

    // Get all sockets currently in this user's room
    const socketsInRoom = await this.server.in(roomName).fetchSockets();

    // Kick other connections for same user (single session enforcement)
    // This prevents duplicate notifications when user has multiple tabs/windows open
    if (socketsInRoom.length > 0) {
      this.logger.warn(
        `[Security] User ${data.userId} has ${socketsInRoom.length} existing connection(s). Enforcing single session.`
      );

      for (const socket of socketsInRoom) {
        if (socket.id !== client.id) {
          socket.emit('session_conflict', {
            message: 'You have been logged in from another location',
            timestamp: new Date().toISOString(),
          });
          socket.disconnect(true);
          this.logger.log(
            `[Security] Kicked socket ${socket.id} for user ${data.userId} due to new login from ${client.id}`
          );
        }
      }
    }

    // Leave other user rooms to prevent leakage if switching accounts on same socket
    const currentRooms = Array.from(client.rooms);
    for (const room of currentRooms) {
      if (room.startsWith('user-') && room !== roomName) {
        await client.leave(room);
        this.logger.log(`Socket ${client.id} left old user room ${room}`);
      }
    }

    await client.join(roomName);
    this.logger.log(
      `[Socket] User ${data.userId} joined room ${roomName} (socket: ${client.id})`
    );

    return { event: 'joinedUserRoom', data: { userId: data.userId } };
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
    if (!userId) return;

    const roomName = `user-${userId}`;
    this.server.to(roomName).emit(eventType, payload);

    this.logger.log(`[Realtime] Notified user ${userId} of ${eventType}`);
  }
}
