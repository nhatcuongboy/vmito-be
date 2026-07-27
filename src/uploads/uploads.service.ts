import { Injectable } from '@nestjs/common';
import {
  CloudinaryService,
  CloudinaryUploadResult,
} from '../cloudinary/cloudinary.service';
import { UserImagesService } from '../user-images/user-images.service';
import { ImageCategory } from '@prisma/client';

@Injectable()
export class UploadsService {
  constructor(
    private readonly cloudinaryService: CloudinaryService,
    private readonly userImagesService: UserImagesService
  ) {}

  async saveQrCode(
    file: Express.Multer.File,
    userId?: string
  ): Promise<CloudinaryUploadResult> {
    const result = await this.cloudinaryService.uploadQrCode(file);
    if (userId) {
      await this.userImagesService.createFromUploadResult(
        userId,
        result,
        ImageCategory.QR_CODE,
        file.originalname
      );
    }
    return result;
  }

  async savePaymentProof(
    file: Express.Multer.File,
    userId?: string
  ): Promise<CloudinaryUploadResult> {
    const result = await this.cloudinaryService.uploadPaymentProof(file);
    if (userId) {
      await this.userImagesService.createFromUploadResult(
        userId,
        result,
        ImageCategory.PAYMENT_PROOF,
        file.originalname
      );
    }
    return result;
  }

  async saveAvatar(
    file: Express.Multer.File,
    userId?: string
  ): Promise<CloudinaryUploadResult> {
    const result = await this.cloudinaryService.uploadAvatar(file);
    if (userId) {
      await this.userImagesService.createFromUploadResult(
        userId,
        result,
        ImageCategory.AVATAR,
        file.originalname
      );
    }
    return result;
  }

  async saveProfileCover(
    file: Express.Multer.File,
    userId?: string
  ): Promise<CloudinaryUploadResult> {
    const result = await this.cloudinaryService.uploadProfileCover(file);
    if (userId) {
      await this.userImagesService.createFromUploadResult(
        userId,
        result,
        ImageCategory.PROFILE_COVER,
        file.originalname
      );
    }
    return result;
  }

  async saveClubImage(
    file: Express.Multer.File,
    userId?: string
  ): Promise<CloudinaryUploadResult> {
    const result = await this.cloudinaryService.uploadClubImage(file);
    if (userId) {
      await this.userImagesService.createFromUploadResult(
        userId,
        result,
        ImageCategory.CLUB,
        file.originalname
      );
    }
    return result;
  }

  async deleteImage(publicId: string): Promise<void> {
    await this.cloudinaryService.deleteImage(publicId);
  }
}
