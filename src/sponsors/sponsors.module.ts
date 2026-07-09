import { Module } from '@nestjs/common';
import { SponsorsController } from './sponsors.controller';
import { SponsorsService } from './sponsors.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { TournamentAccessModule } from '../common/tournament-access/tournament-access.module';

@Module({
  imports: [PrismaModule, CloudinaryModule, TournamentAccessModule],
  controllers: [SponsorsController],
  providers: [SponsorsService],
  exports: [SponsorsService],
})
export class SponsorsModule {}
