import { Module } from '@nestjs/common';
import {
  TournamentUmpiresController,
  UmpiresController,
} from './umpires.controller';
import { UmpiresService } from './umpires.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TournamentAccessModule } from '../common/tournament-access/tournament-access.module';

@Module({
  imports: [PrismaModule, TournamentAccessModule],
  controllers: [TournamentUmpiresController, UmpiresController],
  providers: [UmpiresService],
  exports: [UmpiresService],
})
export class UmpiresModule {}
