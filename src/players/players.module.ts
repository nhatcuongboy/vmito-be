import { Module } from '@nestjs/common';
import {
  PlayersController,
  SessionPlayersController,
} from './players.controller';
import { PlayersService } from './players.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PlayersController, SessionPlayersController],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
