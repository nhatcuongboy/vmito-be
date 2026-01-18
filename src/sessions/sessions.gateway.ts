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
}
