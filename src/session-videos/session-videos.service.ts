import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SessionAccessService } from '../common/session-access/session-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionVideoDto } from './session-videos.dto';

/** Keeps the host card and the player rail bounded. */
const MAX_VIDEOS_PER_SESSION = 30;

const VIDEO_SELECT = {
  id: true,
  url: true,
  title: true,
  createdAt: true,
} satisfies Prisma.SessionVideoSelect;

@Injectable()
export class SessionVideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SessionAccessService
  ) {}

  async list(sessionId: string, userId: string, role?: string) {
    await this.assertHost(sessionId, userId, role);
    return this.prisma.sessionVideo.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: VIDEO_SELECT,
    });
  }

  async create(
    sessionId: string,
    dto: CreateSessionVideoDto,
    userId: string,
    role?: string
  ) {
    await this.assertHost(sessionId, userId, role);
    const count = await this.prisma.sessionVideo.count({
      where: { sessionId },
    });
    if (count >= MAX_VIDEOS_PER_SESSION) {
      throw new BadRequestException({
        code: 'SESSION_VIDEO_LIMIT',
        message: `A session can hold at most ${MAX_VIDEOS_PER_SESSION} clips`,
      });
    }
    const title = dto.title?.trim();
    return this.prisma.sessionVideo.create({
      data: {
        sessionId,
        url: normalizeVideoUrl(dto.url),
        title: title ? title : null,
        createdById: userId,
      },
      select: VIDEO_SELECT,
    });
  }

  async remove(
    sessionId: string,
    videoId: string,
    userId: string,
    role?: string
  ) {
    await this.assertHost(sessionId, userId, role);
    const { count } = await this.prisma.sessionVideo.deleteMany({
      where: { id: videoId, sessionId },
    });
    if (count === 0) throw new NotFoundException('Video not found');
    return { id: videoId };
  }

  /**
   * Clips grouped by session for the caller's own profile. Only APPROVED
   * player slots count — a pending or rejected request never played.
   */
  async mine(userId: string, page: number, limit: number) {
    const where: Prisma.SessionWhereInput = {
      videos: { some: {} },
      players: { some: { userId, registrationStatus: 'APPROVED' } },
    };
    const [total, sessions] = await Promise.all([
      this.prisma.session.count({ where }),
      this.prisma.session.findMany({
        where,
        // Sessions have no "last clip at" column; start time is the stable
        // proxy for "most recent match" and keeps pagination deterministic.
        orderBy: [
          { scheduledStartTime: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          slug: true,
          name: true,
          sportType: true,
          startTime: true,
          scheduledStartTime: true,
          coverPhoto: true,
          videos: { orderBy: { createdAt: 'asc' }, select: VIDEO_SELECT },
        },
      }),
    ]);
    return {
      data: sessions.map(({ videos, ...session }) => ({ session, videos })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async assertHost(sessionId: string, userId: string, role?: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { hostId: true, isCrawled: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.isCrawled) {
      throw new ForbiddenException(
        'Crawled (vãng lai) sessions are view-only and cannot be modified.'
      );
    }
    this.access.assertHostOrAdmin(session.hostId, userId, role);
  }
}

function normalizeVideoUrl(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return trimmed;
  } catch {
    // fall through
  }
  throw new BadRequestException('url must be a valid http or https URL');
}
