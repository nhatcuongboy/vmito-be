import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ShuttlecocksAdminController } from './shuttlecocks-admin.controller';
import { ShuttlecocksController } from './shuttlecocks.controller';
import { ShuttlecocksService } from './shuttlecocks.service';

@Module({
  imports: [PrismaModule],
  controllers: [ShuttlecocksController, ShuttlecocksAdminController],
  providers: [ShuttlecocksService],
  exports: [ShuttlecocksService],
})
export class ShuttlecocksModule {}
