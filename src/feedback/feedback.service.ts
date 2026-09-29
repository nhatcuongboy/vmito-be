import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FeedbackType, NotificationType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { QueryFeedbackDto } from './dto/query-feedback.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private notificationsService: NotificationsService
  ) {}

  async create(dto: CreateFeedbackDto, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    const feedback = await this.prisma.feedback.create({
      data: {
        ...dto,
        userId,
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    // Send email notification to admin (non-blocking)
    if (user) {
      this.mailService
        .sendFeedbackNotification({
          type: dto.type,
          title: dto.title,
          description: dto.description,
          userName: user.name,
          userEmail: user.email,
        })
        .catch(() => {
          // Already logged in MailService
        });
    }

    // Non-blocking: a failed notification must not fail the submission.
    this.notifyAdmins(feedback.id, dto, userId, user?.name ?? null).catch(
      (error: unknown) => {
        this.logger.error(
          `Failed to notify admins about feedback ${feedback.id}`,
          error instanceof Error ? error.stack : String(error)
        );
      }
    );

    return feedback;
  }

  /**
   * In-app + push notification to every ADMIN except the submitter.
   * Uses `SYSTEM` (no dedicated enum value, so no migration); clients key
   * off `data.action`. `url` is the web admin page — the web panel
   * navigates to `data.url`, the app routes by `feedbackId`.
   */
  private async notifyAdmins(
    feedbackId: string,
    dto: CreateFeedbackDto,
    userId: string,
    userName: string | null
  ) {
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, id: { not: userId } },
      select: { id: true },
    });
    if (admins.length === 0) return;

    const isBug = dto.type === FeedbackType.BUG_REPORT;
    const senderName = userName?.trim() || 'Người dùng';
    await this.notificationsService.createManyForUsers(
      admins.map((admin) => admin.id),
      NotificationType.SYSTEM,
      isBug ? 'Báo lỗi mới' : 'Liên hệ mới',
      `${senderName}: ${dto.title}`,
      {
        action: isBug ? 'admin_new_bug_report' : 'admin_new_contact',
        feedbackId,
        feedbackType: dto.type,
        feedbackTitle: dto.title,
        userName: senderName,
        url: '/admin/feedback',
      }
    );
  }

  async findUserFeedback(userId: string, query: QueryFeedbackDto) {
    const where: Record<string, unknown> = { userId };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    return await this.prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
  }

  async findAllAdmin(query: QueryFeedbackDto) {
    const where: Record<string, unknown> = {};
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    return await this.prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
  }

  async findOneAdmin(id: string) {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }
    return feedback;
  }

  async updateStatus(id: string, dto: UpdateFeedbackStatusDto) {
    const feedback = await this.prisma.feedback.findUnique({ where: { id } });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    return this.prisma.feedback.update({
      where: { id },
      data: {
        status: dto.status,
        adminNote: dto.adminNote,
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
  }
}
