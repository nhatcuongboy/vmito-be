import { Module } from '@nestjs/common';
import { SessionAccessModule } from '../common/session-access/session-access.module';
import { SessionVideosController } from './session-videos.controller';
import { SessionVideosService } from './session-videos.service';

@Module({
  imports: [SessionAccessModule],
  controllers: [SessionVideosController],
  providers: [SessionVideosService],
})
export class SessionVideosModule {}
