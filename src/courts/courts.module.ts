import { Module, forwardRef } from '@nestjs/common';
import { CourtsController } from './courts.controller';
import { CourtsService } from './courts.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AiModule } from '../ai/ai.module';
import { SessionAccessModule } from '../common/session-access/session-access.module';
import { PointsModule } from '../points/points.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => SessionsModule),
    AiModule,
    SessionAccessModule,
    PointsModule,
  ],
  controllers: [CourtsController],
  providers: [CourtsService],
  exports: [CourtsService],
})
export class CourtsModule {}
