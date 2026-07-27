import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  v2 as cloudinary,
  UploadApiResponse,
  UploadApiErrorResponse,
} from 'cloudinary';

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  secureUrl: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
}

@Injectable()
export class CloudinaryService {
  constructor(private configService: ConfigService) {
    const cloudinaryUrl = this.configService.get<string>('CLOUDINARY_URL');

    if (cloudinaryUrl) {
      // Use CLOUDINARY_URL if available (recommended)
      cloudinary.config(cloudinaryUrl);
    } else {
      // Fallback to individual credentials
      cloudinary.config({
        cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
        api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
        api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
      });
    }
  }

  async uploadImage(
    file: Express.Multer.File,
    folder: string,
    options?: {
      transformation?: Record<string, unknown>[];
      format?: string;
      quality?: string | number;
    }
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        folder: `badminton/${folder}`,
        resource_type: 'image' as const,
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        ...options,
      };

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined
        ) => {
          if (error) {
            reject(new BadRequestException(`Upload failed: ${error.message}`));
          } else if (result) {
            resolve({
              url: result.url,
              publicId: result.public_id,
              secureUrl: result.secure_url,
              format: result.format,
              width: result.width,
              height: result.height,
              bytes: result.bytes,
            });
          }
        }
      );

      uploadStream.end(file.buffer);
    });
  }

  async uploadQrCode(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return this.uploadImage(file, 'qr-codes', {
      transformation: [
        { width: 800, height: 800, crop: 'limit' },
        { quality: 'auto:good' },
      ],
    });
  }

  async uploadPaymentProof(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return this.uploadImage(file, 'payment-proofs', {
      transformation: [
        { width: 1200, height: 1600, crop: 'limit' },
        { quality: 'auto:good' },
      ],
    });
  }

  async uploadAvatar(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return this.uploadImage(file, 'avatars', {
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
      ],
    });
  }

  async uploadClubImage(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return this.uploadImage(file, 'club-images', {
      transformation: [
        { width: 800, height: 800, crop: 'fill' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
      ],
    });
  }

  async uploadSessionCoverPhoto(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return this.uploadImage(file, 'session-covers', {
      transformation: [
        { width: 2000, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
      ],
    });
  }

  async uploadProfileCover(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return this.uploadImage(file, 'profile-covers', {
      transformation: [
        { width: 1600, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
      ],
    });
  }

  async uploadFeedbackImage(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return this.uploadImage(file, 'feedback', {
      transformation: [
        { width: 1600, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
      ],
    });
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error('Failed to delete image from Cloudinary:', error);
    }
  }

  async deleteImages(publicIds: string[]): Promise<void> {
    try {
      await cloudinary.api.delete_resources(publicIds);
    } catch (error) {
      console.error('Failed to delete images from Cloudinary:', error);
    }
  }

  getOptimizedUrl(
    publicId: string,
    options?: {
      width?: number;
      height?: number;
      crop?: string;
      quality?: string;
      format?: string;
    }
  ): string {
    return cloudinary.url(publicId, {
      secure: true,
      ...options,
    });
  }

  getThumbnailUrl(publicId: string, size: number = 200): string {
    return this.getOptimizedUrl(publicId, {
      width: size,
      height: size,
      crop: 'fill',
      quality: 'auto:good',
      format: 'auto',
    });
  }
}
