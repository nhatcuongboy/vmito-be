import { Module } from '@nestjs/common';
import { UserImagesController } from './user-images.controller';
import { UserImagesService } from './user-images.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [PrismaModule, CloudinaryModule],
  controllers: [UserImagesController],
  providers: [UserImagesService],
  exports: [UserImagesService],
})
export class UserImagesModule {}
