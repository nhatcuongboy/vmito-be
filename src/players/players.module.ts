import { Module, forwardRef } from '@nestjs/common';
import {
  PlayersController,
  SessionPlayersController,
} from './players.controller';
import { PlayersService } from './players.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [PrismaModule, forwardRef(() => SessionsModule)],
  controllers: [PlayersController, SessionPlayersController],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
