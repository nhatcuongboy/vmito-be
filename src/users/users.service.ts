import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcryptjs';
import { removeVietnameseTones } from '../common/utils/string.utils';
import { ActivityFeedService } from '../activities/activity-feed.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private activityFeedService: ActivityFeedService
  ) {}

  private readonly userSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    image: true,
    imagePublicId: true,
    coverPhoto: true,
    coverPhotoPublicId: true,
    gender: true,
    level: true,
    levelDescription: true,
    phone: true,
    emailVerified: true,
    createdAt: true,
    updatedAt: true,
  };

  async findAll(options?: {
    search?: string;
    role?: string;
    page?: number;
    limit?: number;
  }) {
    const where: {
      OR?: {
        email?: { contains: string; mode: 'insensitive' };
        name?: { contains: string; mode: 'insensitive' };
        searchTerms?: { contains: string; mode: 'insensitive' };
      }[];
      role?: Role;
    } = {};

    if (options?.search) {
      const searchTerm = removeVietnameseTones(options.search).toLowerCase();
      where.OR = [
        { searchTerms: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: options.search, mode: 'insensitive' } },
        { name: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    if (options?.role) {
      where.role = options.role as Role;
    }

    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: this.userSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.userSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getPublicProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        image: true,
        coverPhoto: true,
        role: true,
        gender: true,
        level: true,
        levelDescription: true,
        phone: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Count distinct sessions the user has joined as a player,
    // excluding sessions they hosted themselves.
    const joinedSessions = await this.prisma.player.findMany({
      where: {
        userId: id,
        session: { hostId: { not: id } },
      },
      distinct: ['sessionId'],
      select: { sessionId: true },
    });

    return {
      ...user,
      joinedSessionsCount: joinedSessions.length,
    };
  }

  async create(createUserDto: CreateUserDto) {
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Hash password if provided
    let hashedPassword: string | undefined;
    if (createUserDto.password) {
      hashedPassword = await bcrypt.hash(createUserDto.password, 12);
    }

    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        name: createUserDto.name,
        password: hashedPassword,
        role: createUserDto.role,
        gender: createUserDto.gender,
        phone: createUserDto.phone,
        searchTerms: removeVietnameseTones(
          `${createUserDto.name} ${createUserDto.email} ${createUserDto.phone || ''}`
        ).toLowerCase(),
      },
      select: this.userSelect,
    });

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Hash password if updating
    const data: UpdateUserDto & { password?: string; searchTerms?: string } = {
      ...updateUserDto,
    };
    if (updateUserDto.password) {
      data.password = await bcrypt.hash(updateUserDto.password, 12);
    }

    if (updateUserDto.name || updateUserDto.phone) {
      // We need current values to form complete search terms, but optimization:
      // just verify if we can get them from `user` object above since we did findUnique
      const name = updateUserDto.name || user.name;
      const phone =
        updateUserDto.phone !== undefined ? updateUserDto.phone : user.phone;
      const email = user.email;

      data.searchTerms = removeVietnameseTones(
        `${name} ${email} ${phone || ''}`
      ).toLowerCase();
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: this.userSelect,
    });

    // Newsfeed: announce avatar changes (only when the image actually changed).
    if (
      updateUserDto.image !== undefined &&
      updateUserDto.image &&
      updateUserDto.image !== user.image
    ) {
      await this.activityFeedService.postAvatarUpdated(id, updateUserDto.image);
    }

    return updated;
  }

  /**
   * Delete the caller's own account (App Store Guideline 5.1.1(v)).
   *
   * **This anonymizes rather than row-deletes, and that is deliberate.**
   *
   * `Session.host` has no `onDelete` rule, so Prisma defaults to `Restrict`:
   * `user.delete()` throws for anyone who has ever hosted a session. Adding a
   * cascade there would be worse — it would erase sessions that other players
   * joined, along with their match history and payment records. The same holds
   * for ratings given to other people and for the payment ledger, which is
   * financial history belonging to both sides of a transaction.
   *
   * So the account is made permanently unusable and stripped of personal data,
   * while rows that are *also* other people's data keep referential integrity:
   *
   * - removed: password, OAuth links, refresh tokens, auth sessions, phone,
   *   gender, level, avatar and cover images, notifications, favourites,
   *   uploaded images (all cascade from the deletes below);
   * - anonymized: name and email — the email is replaced with a unique,
   *   non-routable address so the account can never be signed into or
   *   recovered, and so the real address is free to register again;
   * - retained: hosted sessions, payment records and ratings, now attributed
   *   to an anonymous user.
   *
   * The whole thing runs in one transaction: a half-anonymized account that
   * still has a usable password would be worse than either outcome.
   */
  async deleteOwnAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Same guard as the admin path: losing the last admin locks everyone out
    // of the admin panel with no way back in.
    if (user.role === Role.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: { role: Role.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot delete the last admin account');
      }
    }

    const anonymousEmail = `deleted_${userId}@users.vmito.invalid`;

    await this.prisma.$transaction([
      // Kill every way back in first, so an interrupted transaction can never
      // leave a signed-in session alive on an anonymized account.
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.authSession.deleteMany({ where: { userId } }),
      this.prisma.account.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),

      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: anonymousEmail,
          name: 'Người dùng đã xoá',
          password: null,
          image: null,
          imagePublicId: null,
          coverPhoto: null,
          coverPhotoPublicId: null,
          phone: null,
          gender: null,
          level: null,
          levelDescription: null,
          searchTerms: null,
          emailVerified: null,
        },
      }),
    ]);

    return {
      deleted: true,
      message: 'Tài khoản đã được xoá.',
    };
  }

  async delete(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent deleting the last admin
    if (user.role === 'ADMIN') {
      const adminCount = await this.prisma.user.count({
        where: { role: 'ADMIN' },
      });

      if (adminCount <= 1) {
        throw new BadRequestException('Cannot delete the last admin user');
      }
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return { message: 'User deleted successfully', id };
  }

  async updateRole(id: string, role: Role) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: this.userSelect,
    });
  }
}
