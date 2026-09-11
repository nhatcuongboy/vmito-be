import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreateWelcomePopupDto } from './dto/create-welcome-popup.dto';
import { UpdateWelcomePopupDto } from './dto/update-welcome-popup.dto';

@Injectable()
export class WelcomePopupsService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService
  ) {}

  async getActive() {
    const now = new Date();
    return this.prisma.welcomePopup.findFirst({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
        ],
      },
      orderBy: [{ displayOrder: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findAll() {
    return this.prisma.welcomePopup.findMany({
      orderBy: [{ displayOrder: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreateWelcomePopupDto, createdById?: string) {
    return this.prisma.welcomePopup.create({
      data: {
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl ?? null,
        imagePublicId: dto.imagePublicId ?? null,
        ctaLabel: dto.ctaLabel ?? null,
        ctaUrl: dto.ctaUrl ?? null,
        isActive: dto.isActive ?? true,
        displayOrder: dto.displayOrder ?? 0,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        createdById: createdById ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateWelcomePopupDto) {
    const popup = await this.getOrThrow(id);

    // When the image is replaced or removed, clean up the previous Cloudinary asset.
    const isImageChanged =
      dto.imagePublicId !== undefined &&
      dto.imagePublicId !== popup.imagePublicId;
    if (isImageChanged && popup.imagePublicId) {
      await this.cloudinary.deleteImage(popup.imagePublicId);
    }

    return this.prisma.welcomePopup.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl || null }),
        ...(dto.imagePublicId !== undefined && {
          imagePublicId: dto.imagePublicId || null,
        }),
        ...(dto.ctaLabel !== undefined && { ctaLabel: dto.ctaLabel || null }),
        ...(dto.ctaUrl !== undefined && { ctaUrl: dto.ctaUrl || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.displayOrder !== undefined && {
          displayOrder: dto.displayOrder,
        }),
        ...(dto.startDate !== undefined && {
          startDate: dto.startDate ? new Date(dto.startDate) : null,
        }),
        ...(dto.endDate !== undefined && {
          endDate: dto.endDate ? new Date(dto.endDate) : null,
        }),
      },
    });
  }

  async remove(id: string) {
    const popup = await this.getOrThrow(id);

    if (popup.imagePublicId) {
      await this.cloudinary.deleteImage(popup.imagePublicId);
    }

    await this.prisma.welcomePopup.delete({ where: { id } });
    return { success: true };
  }

  async uploadBanner(file: Express.Multer.File) {
    const result = await this.cloudinary.uploadImage(
      file,
      'welcome-popup-banners',
      {
        transformation: [{ width: 1600, crop: 'limit' }],
        quality: 'auto:good',
      }
    );
    return { url: result.secureUrl, publicId: result.publicId };
  }

  private async getOrThrow(id: string) {
    const popup = await this.prisma.welcomePopup.findUnique({ where: { id } });
    if (!popup) throw new NotFoundException('Welcome popup not found');
    return popup;
  }
}
