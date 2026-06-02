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

// Event types for tournament live-scoring updates.
export enum TournamentEventType {
  TOURNAMENT_MATCH_STARTED = 'tournament_match_started',
  TOURNAMENT_MATCH_SCORE_UPDATED = 'tournament_match_score_updated',
  TOURNAMENT_MATCH_ENDED = 'tournament_match_ended',
  TOURNAMENT_MATCH_REFEREE_ASSIGNED = 'tournament_match_referee_assigned',
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/tournaments',
})
export class TournamentsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private logger: Logger = new Logger('TournamentsGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Join a tournament room to receive live scoreboard updates. No auth is
   * required — the scoreboard is public and read-only. Writes still go through
   * authorized HTTP endpoints; the gateway only broadcasts results.
   */
  @SubscribeMessage('joinTournament')
  async handleJoinTournament(
    @MessageBody() tournamentId: string,
    @ConnectedSocket() client: Socket
  ) {
    const roomName = `tournament_${tournamentId}`;
    await client.join(roomName);
    this.logger.log(`Client ${client.id} joined room ${roomName}`);
    return { event: 'joinedTournament', data: { tournamentId } };
  }

  @SubscribeMessage('leaveTournament')
  async handleLeaveTournament(
    @MessageBody() tournamentId: string,
    @ConnectedSocket() client: Socket
  ) {
    const roomName = `tournament_${tournamentId}`;
    await client.leave(roomName);
    this.logger.log(`Client ${client.id} left room ${roomName}`);
    return { event: 'leftTournament', data: { tournamentId } };
  }

  /**
   * Broadcast a tournament event to everyone watching the tournament room.
   */
  notifyTournamentEvent(
    tournamentId: string,
    eventType: TournamentEventType,
    payload: Record<string, unknown>
  ) {
    const roomName = `tournament_${tournamentId}`;
    this.server.to(roomName).emit(eventType, { tournamentId, ...payload });
    this.logger.log(`Notified ${eventType} for tournament ${tournamentId}`);
  }
}
