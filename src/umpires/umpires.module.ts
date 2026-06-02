import { Module } from '@nestjs/common';
import {
  TournamentUmpiresController,
  UmpiresController,
} from './umpires.controller';
import { UmpiresService } from './umpires.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TournamentUmpiresController, UmpiresController],
  providers: [UmpiresService],
  exports: [UmpiresService],
})
export class UmpiresModule {}
