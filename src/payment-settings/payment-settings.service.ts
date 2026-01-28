import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentSettingsDto, UpdatePaymentSettingsDto } from './dto';

@Injectable()
export class PaymentSettingsService {
  private readonly settingsSelect = {
    id: true,
    userId: true,
    bankName: true,
    bankAccountNumber: true,
    accountHolderName: true,
    qrCodeUrl: true,
    isDefault: true,
    createdAt: true,
    updatedAt: true,
  };

  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.hostPaymentSettings.findMany({
      where: { userId },
      select: this.settingsSelect,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findDefault(userId: string) {
    return this.prisma.hostPaymentSettings.findFirst({
      where: { userId, isDefault: true },
      select: this.settingsSelect,
    });
  }

  async findDefaultByHost(hostId: string) {
    return this.prisma.hostPaymentSettings.findFirst({
      where: { userId: hostId, isDefault: true },
      select: this.settingsSelect,
    });
  }

  async findOne(id: string, userId: string) {
    const settings = await this.prisma.hostPaymentSettings.findUnique({
      where: { id },
      select: this.settingsSelect,
    });

    if (!settings) {
      throw new NotFoundException('Payment settings not found');
    }

    if (settings.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return settings;
  }

  async create(dto: CreatePaymentSettingsDto, userId: string) {
    // If this is set as default, unset other defaults
    if (dto.isDefault) {
      await this.unsetOtherDefaults(userId);
    }

    // If this is the first settings, make it default
    const existingCount = await this.prisma.hostPaymentSettings.count({
      where: { userId },
    });

    const isDefault = dto.isDefault ?? existingCount === 0;

    return this.prisma.hostPaymentSettings.create({
      data: {
        userId,
        bankName: dto.bankName,
        bankAccountNumber: dto.bankAccountNumber,
        accountHolderName: dto.accountHolderName,
        qrCodeUrl: dto.qrCodeUrl,
        isDefault,
      },
      select: this.settingsSelect,
    });
  }

  async update(id: string, dto: UpdatePaymentSettingsDto, userId: string) {
    const existing = await this.prisma.hostPaymentSettings.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Payment settings not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // If setting as default, unset other defaults
    if (dto.isDefault) {
      await this.unsetOtherDefaults(userId, id);
    }

    return this.prisma.hostPaymentSettings.update({
      where: { id },
      data: {
        bankName: dto.bankName,
        bankAccountNumber: dto.bankAccountNumber,
        accountHolderName: dto.accountHolderName,
        qrCodeUrl: dto.qrCodeUrl,
        isDefault: dto.isDefault,
      },
      select: this.settingsSelect,
    });
  }

  async delete(id: string, userId: string) {
    const existing = await this.prisma.hostPaymentSettings.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Payment settings not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.hostPaymentSettings.delete({
      where: { id },
    });

    // If deleted was default, make another one default
    if (existing.isDefault) {
      const next = await this.prisma.hostPaymentSettings.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      if (next) {
        await this.prisma.hostPaymentSettings.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    return { message: 'Payment settings deleted successfully' };
  }

  async setDefault(id: string, userId: string) {
    const existing = await this.prisma.hostPaymentSettings.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Payment settings not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Unset other defaults
    await this.unsetOtherDefaults(userId, id);

    return this.prisma.hostPaymentSettings.update({
      where: { id },
      data: { isDefault: true },
      select: this.settingsSelect,
    });
  }

  private async unsetOtherDefaults(userId: string, excludeId?: string) {
    await this.prisma.hostPaymentSettings.updateMany({
      where: {
        userId,
        isDefault: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      data: { isDefault: false },
    });
  }
}
