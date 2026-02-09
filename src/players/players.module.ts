import { Module, forwardRef } from '@nestjs/common';
import {
  PlayersController,
  SessionPlayersController,
} from './players.controller';
import { PlayersService } from './players.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsModule } from '../sessions/sessions.module';
import { FeeModule } from '../fee/fee.module';
import { ClubsModule } from '../clubs/clubs.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => SessionsModule),
    FeeModule,
    ClubsModule,
  ],
  controllers: [PlayersController, SessionPlayersController],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
