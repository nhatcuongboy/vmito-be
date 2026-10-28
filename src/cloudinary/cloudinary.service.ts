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

  // Incoming transformations re-encode the *stored original*, which every
  // delivery URL (f_auto,q_auto,w_…) is derived from. Clients already
  // compress once before upload, so store at auto:best and only cap the size;
  // auto:good here was a second lossy pass that visibly softened photos.
  // Width caps match the client presets (IMAGE_UPLOAD_PRESETS in vmito-fe).
  async uploadQrCode(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return this.uploadImage(file, 'qr-codes', {
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto:best' },
      ],
    });
  }

  async uploadPaymentProof(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return this.uploadImage(file, 'payment-proofs', {
      transformation: [
        { width: 2048, height: 2048, crop: 'limit' },
        { quality: 'auto:best' },
      ],
    });
  }

  async uploadAvatar(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return this.uploadImage(file, 'avatars', {
      transformation: [
        // 1000px keeps fullscreen/retina previews sharp; circles downscale fine.
        { width: 1000, height: 1000, crop: 'fill', gravity: 'face' },
        { quality: 'auto:best' },
      ],
    });
  }

  async uploadClubImage(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    // Square fill crop is correct here — this is specifically the club logo,
    // a small icon-like image. Gallery/cover photos use uploadClubCoverPhoto.
    return this.uploadImage(file, 'club-images', {
      transformation: [
        { width: 800, height: 800, crop: 'fill' },
        { quality: 'auto:best' },
      ],
    });
  }

  async uploadClubCoverPhoto(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return this.uploadImage(file, 'club-covers', {
      transformation: [
        { width: 2560, crop: 'limit' },
        { quality: 'auto:best' },
      ],
    });
  }

  async uploadSessionCoverPhoto(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return this.uploadImage(file, 'session-covers', {
      transformation: [
        { width: 2560, crop: 'limit' },
        { quality: 'auto:best' },
      ],
    });
  }

  async uploadProfileCover(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return this.uploadImage(file, 'profile-covers', {
      transformation: [
        { width: 2560, crop: 'limit' },
        { quality: 'auto:best' },
      ],
    });
  }

  async uploadFeedbackImage(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    return this.uploadImage(file, 'feedback', {
      transformation: [
        { width: 1600, crop: 'limit' },
        { quality: 'auto:best' },
      ],
    });
  }

  async uploadGenericImage(
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    // Fallback for uncategorized uploads (venue covers, tournament banners,
    // sponsor logos, etc.). crop:'limit' with only a width bound never crops
    // or distorts — it only downscales oversized images, so every aspect
    // ratio is preserved as-is.
    return this.uploadImage(file, 'user-uploads', {
      transformation: [
        { width: 2048, crop: 'limit' },
        { quality: 'auto:best' },
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
