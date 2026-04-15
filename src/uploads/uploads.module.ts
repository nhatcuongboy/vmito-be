import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { UserImagesModule } from '../user-images/user-images.module';

@Module({
  imports: [CloudinaryModule, UserImagesModule],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
