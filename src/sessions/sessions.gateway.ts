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
  server: Server;

  private logger: Logger = new Logger('SessionsGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    this.logger.log(
      `Client disconnected: ${client.id}${userId ? ` (user: ${userId})` : ''}`
    );

    // Clean up: leave all user rooms on disconnect
    const currentRooms = Array.from(client.rooms);
    for (const room of currentRooms) {
      if (room.startsWith('user-')) {
        client.leave(room);
        this.logger.log(`Socket ${client.id} auto-left user room ${room} on disconnect`);
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
    if (!data?.userId) {
      this.logger.warn(`Socket ${client.id} attempted to join user room without userId`);
      return;
    }

    const roomName = `user-${data.userId}`;

    // Leave ALL user rooms to prevent leakage
    const currentRooms = Array.from(client.rooms);
    for (const room of currentRooms) {
      if (room.startsWith('user-')) {
        await client.leave(room);
        this.logger.log(`Socket ${client.id} left user room ${room}`);
      }
    }

    // Store userId in socket data for verification
    client.data.userId = data.userId;

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
    if (!userId) {
      this.logger.warn(`[Realtime] Attempted to notify user with empty userId`);
      return;
    }

    const roomName = `user-${userId}`;
    
    // Get all sockets in this room and verify they belong to the correct user
    const socketsInRoom = this.server.in(roomName).fetchSockets();
    socketsInRoom.then((sockets) => {
      let validSocketCount = 0;
      for (const socket of sockets) {
        // Verify socket belongs to the correct user
        if (socket.data.userId === userId) {
          validSocketCount++;
        } else {
          // Socket in wrong room - force leave
          this.logger.warn(
            `[Security] Socket ${socket.id} (user: ${socket.data.userId}) found in wrong room ${roomName}. Removing.`
          );
          socket.leave(roomName);
        }
      }
      
      if (validSocketCount > 0) {
        this.logger.log(
          `[Realtime] Notified user ${userId} of ${eventType} (${validSocketCount} socket(s))`
        );
      }
    });

    // Emit to room (after cleanup above, only valid sockets remain)
    this.server.to(roomName).emit(eventType, payload);
  }
}
