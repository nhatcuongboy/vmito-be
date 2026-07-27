import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CloudinaryService,
  CloudinaryUploadResult,
} from '../cloudinary/cloudinary.service';
import { ImageCategory } from '@prisma/client';

@Injectable()
export class UserImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService
  ) {}

  async findAll(
    userId: string,
    options?: { category?: ImageCategory; page?: number; limit?: number }
  ) {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: { userId: string; category?: ImageCategory } = { userId };
    if (options?.category) {
      where.category = options.category;
    }

    const [images, total] = await Promise.all([
      this.prisma.userImage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.userImage.count({ where }),
    ]);

    return {
      data: images,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async upload(
    userId: string,
    file: Express.Multer.File,
    category: ImageCategory = ImageCategory.OTHER
  ) {
    const uploadResult = await this.getUploadMethod(category, file);

    const userImage = await this.prisma.userImage.create({
      data: {
        userId,
        url: uploadResult.secureUrl,
        publicId: uploadResult.publicId,
        originalName: file.originalname,
        format: uploadResult.format,
        width: uploadResult.width,
        height: uploadResult.height,
        bytes: uploadResult.bytes,
        category,
      },
    });

    return userImage;
  }

  async createFromUploadResult(
    userId: string,
    uploadResult: CloudinaryUploadResult,
    category: ImageCategory,
    originalName?: string
  ) {
    return this.prisma.userImage.create({
      data: {
        userId,
        url: uploadResult.secureUrl,
        publicId: uploadResult.publicId,
        originalName,
        format: uploadResult.format,
        width: uploadResult.width,
        height: uploadResult.height,
        bytes: uploadResult.bytes,
        category,
      },
    });
  }

  async remove(id: string, userId: string, role?: string) {
    const image = await this.prisma.userImage.findUnique({
      where: { id },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    if (role !== 'ADMIN' && image.userId !== userId) {
      throw new ForbiddenException('Not authorized to delete this image');
    }

    await this.cloudinaryService.deleteImage(image.publicId);

    await this.prisma.userImage.delete({
      where: { id },
    });

    return { message: 'Image deleted successfully' };
  }

  private async getUploadMethod(
    category: ImageCategory,
    file: Express.Multer.File
  ): Promise<CloudinaryUploadResult> {
    switch (category) {
      case ImageCategory.SESSION_COVER:
        return this.cloudinaryService.uploadSessionCoverPhoto(file);
      case ImageCategory.AVATAR:
        return this.cloudinaryService.uploadAvatar(file);
      case ImageCategory.CLUB:
        return this.cloudinaryService.uploadClubImage(file);
      case ImageCategory.CLUB_COVER:
        return this.cloudinaryService.uploadClubCoverPhoto(file);
      case ImageCategory.QR_CODE:
        return this.cloudinaryService.uploadQrCode(file);
      case ImageCategory.PAYMENT_PROOF:
        return this.cloudinaryService.uploadPaymentProof(file);
      default:
        return this.cloudinaryService.uploadGenericImage(file);
    }
  }
}
