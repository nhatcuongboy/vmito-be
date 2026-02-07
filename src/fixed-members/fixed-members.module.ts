import { Module } from '@nestjs/common';
import { FixedMembersController } from './fixed-members.controller';
import { FixedMembersService } from './fixed-members.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [FixedMembersController],
  providers: [FixedMembersService, PrismaService],
  exports: [FixedMembersService],
})
export class FixedMembersModule {}
