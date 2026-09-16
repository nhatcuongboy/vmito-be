import { Module } from '@nestjs/common';
import { PlayerProfilesService } from './player-profiles.service';
import { PlayerProfilesController } from './player-profiles.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PlayerProfilesController],
  providers: [PlayerProfilesService],
  exports: [PlayerProfilesService],
})
export class PlayerProfilesModule {}
