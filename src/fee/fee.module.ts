import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FeeController } from './fee.controller';
import { FeeService } from './fee.service';
import { ClubsModule } from '../clubs/clubs.module';
import { SessionAccessModule } from '../common/session-access/session-access.module';

@Module({
  imports: [PrismaModule, ClubsModule, SessionAccessModule],
  controllers: [FeeController],
  providers: [FeeService],
  exports: [FeeService],
})
export class FeeModule {}
