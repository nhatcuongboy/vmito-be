import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { QueryFeedbackDto } from './dto/query-feedback.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';

@Injectable()
export class FeedbackService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService
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

    return feedback;
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
