import { Module } from '@nestjs/common';
import { WelcomePopupsController } from './welcome-popups.controller';
import { WelcomePopupsService } from './welcome-popups.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [PrismaModule, CloudinaryModule],
  controllers: [WelcomePopupsController],
  providers: [WelcomePopupsService],
  exports: [WelcomePopupsService],
})
export class WelcomePopupsModule {}
