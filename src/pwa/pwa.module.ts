import { Module } from '@nestjs/common';
import { PwaController } from './pwa.controller';
import { PwaService } from './pwa.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PwaController],
  providers: [PwaService],
  exports: [PwaService],
})
export class PwaModule {}
