import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsGateway } from './sessions.gateway';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { FixedMembersModule } from '../fixed-members/fixed-members.module';

@Module({
  imports: [PrismaModule, CloudinaryModule, FixedMembersModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionsGateway],
  exports: [SessionsService, SessionsGateway],
})
export class SessionsModule {}
