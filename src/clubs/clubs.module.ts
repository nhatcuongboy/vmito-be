import { Module } from '@nestjs/common';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClubsController],
  providers: [ClubsService],
  exports: [ClubsService],
})
export class ClubsModule {}
