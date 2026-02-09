import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsGateway } from './sessions.gateway';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { ClubsModule } from '../clubs/clubs.module';

@Module({
  imports: [PrismaModule, CloudinaryModule, ClubsModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionsGateway],
  exports: [SessionsService, SessionsGateway],
})
export class SessionsModule {}
