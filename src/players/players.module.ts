import { Module, forwardRef } from '@nestjs/common';
import {
  PlayersController,
  SessionPlayersController,
} from './players.controller';
import { PlayersService } from './players.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsModule } from '../sessions/sessions.module';
import { FeeModule } from '../fee/fee.module';
import { FixedMembersModule } from '../fixed-members/fixed-members.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => SessionsModule),
    FeeModule,
    FixedMembersModule,
  ],
  controllers: [PlayersController, SessionPlayersController],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
