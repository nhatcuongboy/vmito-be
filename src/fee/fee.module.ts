import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FeeController } from './fee.controller';
import { FeeService } from './fee.service';
import { FixedMembersModule } from '../fixed-members/fixed-members.module';

@Module({
  imports: [PrismaModule, FixedMembersModule],
  controllers: [FeeController],
  providers: [FeeService],
  exports: [FeeService],
})
export class FeeModule {}
