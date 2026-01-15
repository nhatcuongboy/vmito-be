import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './strategies/jwt.strategy';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  image?: string;
}

interface UserWithoutPassword {
  id: string;
  email: string;
  name: string;
  role: string;
  image: string | null;
  emailVerified: Date | null;
  gender: string | null;
  level: number | null;
  levelDescription: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  async validateUser(
    email: string,
    password: string
  ): Promise<UserWithoutPassword | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return null;
    }

    const { password: _password, ...result } = user;
    void _password; // Explicitly ignore password
    return result;
  }

  async register(registerDto: RegisterDto) {
    const { email, password, name } = registerDto;

    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'PLAYER',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    return user;
  }

  async login(loginDto: LoginDto) {
    const user: UserWithoutPassword | null = await this.validateUser(
      loginDto.email,
      loginDto.password
    );
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('auth.jwt.expiresIn') || '7d',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        image: user.image,
      },
    };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword } = changePasswordDto;

    // Get user from database
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.password) {
      throw new BadRequestException('User not found or no password set');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    return { message: 'Password updated successfully' };
  }

  async getToken(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '24h',
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 86400, // 24 hours in seconds
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, newPassword, adminKey } = resetPasswordDto;

    // Simple admin key check (in production, use proper admin authentication)
    if (adminKey !== process.env.ADMIN_RESET_KEY) {
      throw new UnauthorizedException('Unauthorized admin access');
    }

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await this.prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    return {
      message: 'Password reset successfully',
      userId: user.id,
      email: user.email,
    };
  }

  /**
   * Find or create a user from Google OAuth profile
   */
  async findOrCreateGoogleUser(profile: GoogleProfile) {
    // Try to find existing user by email
    let user = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (user) {
      // Update user's image if they don't have one
      if (!user.image && profile.image) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { image: profile.image },
        });
      }
      return user;
    }

    // Create new user
    user = await this.prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name,
        image: profile.image,
        role: 'PLAYER',
        emailVerified: new Date(), // Google emails are verified
      },
    });

    return user;
  }

  /**
   * Generate JWT token for a user (used for OAuth flows)
   */
  generateTokenForUser(user: { id: string; email: string; role: string }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('auth.jwt.expiresIn') || '7d',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }
}
