import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FeeController } from './fee.controller';
import { FeeService } from './fee.service';
import { ClubsModule } from '../clubs/clubs.module';

@Module({
  imports: [PrismaModule, ClubsModule],
  controllers: [FeeController],
  providers: [FeeService],
  exports: [FeeService],
})
export class FeeModule {}
