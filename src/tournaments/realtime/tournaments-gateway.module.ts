import { Module } from '@nestjs/common';
import { TournamentsGateway } from './tournaments.gateway';

@Module({
  providers: [TournamentsGateway],
  exports: [TournamentsGateway],
})
export class TournamentsGatewayModule {}
