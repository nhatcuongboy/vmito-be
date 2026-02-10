import { Injectable } from '@nestjs/common';
import {
  CloudinaryService,
  CloudinaryUploadResult,
} from '../cloudinary/cloudinary.service';

@Injectable()
export class UploadsService {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  async saveQrCode(file: Express.Multer.File): Promise<CloudinaryUploadResult> {
    return await this.cloudinaryService.uploadQrCode(file);
  }

  async savePaymentProof(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return await this.cloudinaryService.uploadPaymentProof(file);
  }

  async saveAvatar(file: Express.Multer.File): Promise<CloudinaryUploadResult> {
    return await this.cloudinaryService.uploadAvatar(file);
  }

  async saveClubImage(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return await this.cloudinaryService.uploadClubImage(file);
  }

  async deleteImage(publicId: string): Promise<void> {
    await this.cloudinaryService.deleteImage(publicId);
  }
}
