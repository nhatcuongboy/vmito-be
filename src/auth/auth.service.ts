import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { JwtPayload } from './strategies/jwt.strategy';

// i18n error messages
const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  vi: {
    userAlreadyExists: 'Người dùng đã tồn tại',
    unexpectedError: 'Có lỗi xảy ra. Vui lòng thử lại.',
  },
  en: {
    userAlreadyExists: 'User already exists',
    unexpectedError: 'An error occurred. Please try again.',
  },
  cn: {
    userAlreadyExists: '用户已存在',
    unexpectedError: '发生错误。请重试。',
  },
};

const getErrorMessage = (key: string, locale?: string): string => {
  const lang = locale && ERROR_MESSAGES[locale] ? locale : 'en';
  return ERROR_MESSAGES[lang][key] || ERROR_MESSAGES['en'][key];
};

const PASSWORD_RESET_IDENTIFIER_PREFIX = 'password-reset:';
const PASSWORD_RESET_SUCCESS_MESSAGE =
  'If this email is valid, password reset instructions will be sent.';

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) {
    return `${localPart[0]}*@${domain}`;
  }
  const firstChar = localPart[0];
  const lastChar = localPart[localPart.length - 1];
  return `${firstChar}***${lastChar}@${domain}`;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  image?: string;
}

export interface IZaloProfile {
  zaloId: string;
  name: string;
  image?: string;
  email?: string;
  phone?: string;
}

export interface IFacebookProfile {
  facebookId: string;
  name: string;
  image?: string;
  email?: string;
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
    private configService: ConfigService,
    private mailService: MailService
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

  async register(registerDto: RegisterDto, locale?: string) {
    const { email, password, name, phone, gender } = registerDto;

    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException(getErrorMessage('userAlreadyExists', locale));
    }

    try {
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: 'PLAYER',
          phone: phone ?? null,
          gender: gender ?? null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          gender: true,
          createdAt: true,
        },
      });

      return user;
    } catch (error) {
      // Handle any unexpected errors
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new ConflictException(getErrorMessage('unexpectedError', locale));
    }
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
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('auth.jwt.expiresIn') || '15m',
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

  async adminResetPassword(resetPasswordDto: AdminResetPasswordDto) {
    const { email, newPassword } = resetPasswordDto;

    // Admin authorization is now handled by the controller guard

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

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const email = forgotPasswordDto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      return { message: PASSWORD_RESET_SUCCESS_MESSAGE };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashPasswordResetToken(rawToken);
    const expiresInMinutes = this.getPasswordResetTtlMinutes();
    const expiresAt = this.getPasswordResetExpiry(expiresInMinutes);
    const identifier = this.getPasswordResetIdentifier(email);

    await this.prisma.verificationToken.deleteMany({
      where: { identifier },
    });

    await this.prisma.verificationToken.create({
      data: {
        identifier,
        token: tokenHash,
        expires: expiresAt,
      },
    });

    const resetUrl = this.buildPasswordResetUrl(
      forgotPasswordDto.redirectUrl,
      forgotPasswordDto.locale,
      rawToken
    );

    try {
      await this.mailService.sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        locale: forgotPasswordDto.locale,
        expiresInMinutes,
      });
    } catch {
      return { message: PASSWORD_RESET_SUCCESS_MESSAGE };
    }

    return { message: PASSWORD_RESET_SUCCESS_MESSAGE };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const tokenHash = this.hashPasswordResetToken(resetPasswordDto.token);
    const resetToken = await this.prisma.verificationToken.findUnique({
      where: { token: tokenHash },
    });

    if (
      !resetToken ||
      !resetToken.identifier.startsWith(PASSWORD_RESET_IDENTIFIER_PREFIX) ||
      resetToken.expires < new Date()
    ) {
      if (resetToken) {
        await this.prisma.verificationToken.deleteMany({
          where: {
            identifier: resetToken.identifier,
            token: resetToken.token,
          },
        });
      }
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const email = resetToken.identifier.slice(
      PASSWORD_RESET_IDENTIFIER_PREFIX.length
    );
    const hashedPassword = await bcrypt.hash(resetPasswordDto.newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { email },
        data: { password: hashedPassword },
      }),
      this.prisma.verificationToken.deleteMany({
        where: { identifier: resetToken.identifier },
      }),
      this.prisma.refreshToken.updateMany({
        where: { user: { email }, revoked: false },
        data: { revoked: true },
      }),
    ]);

    return { message: 'Password reset successfully' };
  }

  async verifyResetToken(
    token: string
  ): Promise<{ valid: boolean; maskedEmail: string }> {
    if (!token) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const tokenHash = this.hashPasswordResetToken(token);
    const resetToken = await this.prisma.verificationToken.findUnique({
      where: { token: tokenHash },
    });

    if (
      !resetToken ||
      !resetToken.identifier.startsWith(PASSWORD_RESET_IDENTIFIER_PREFIX) ||
      resetToken.expires < new Date()
    ) {
      if (resetToken) {
        await this.prisma.verificationToken.deleteMany({
          where: {
            identifier: resetToken.identifier,
            token: resetToken.token,
          },
        });
      }
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const email = resetToken.identifier.slice(
      PASSWORD_RESET_IDENTIFIER_PREFIX.length
    );

    return {
      valid: true,
      maskedEmail: maskEmail(email),
    };
  }

  private getPasswordResetIdentifier(email: string): string {
    return `${PASSWORD_RESET_IDENTIFIER_PREFIX}${email}`;
  }

  private hashPasswordResetToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private getPasswordResetTtlMinutes(): number {
    return (
      Number(
        this.configService.get<string>('PASSWORD_RESET_TOKEN_TTL_MINUTES')
      ) || 60
    );
  }

  private getPasswordResetExpiry(ttlMinutes: number): Date {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + ttlMinutes);
    return expiresAt;
  }

  private buildPasswordResetUrl(
    redirectUrl: string,
    locale: string | undefined,
    token: string
  ): string {
    const frontendUrl =
      this.configService.get<string>('frontendUrl') || 'http://localhost:3000';
    const corsOrigin = this.configService.get<string[] | string>(
      'app.cors.origin'
    );
    const configuredOrigins = Array.isArray(corsOrigin)
      ? corsOrigin
      : (corsOrigin || '')
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean);
    const fallbackPath = `/${locale || 'vi'}/auth/reset-password`;
    const fallbackUrl = new URL(fallbackPath, frontendUrl);
    const allowedOrigins = new Set([
      new URL(frontendUrl).origin,
      ...configuredOrigins
        .map((origin) => {
          try {
            return new URL(origin).origin;
          } catch {
            return '';
          }
        })
        .filter(Boolean),
    ]);

    let url = fallbackUrl;
    try {
      const candidateUrl = new URL(redirectUrl);
      if (allowedOrigins.has(candidateUrl.origin)) {
        url = candidateUrl;
      }
    } catch {
      url = fallbackUrl;
    }

    url.searchParams.set('token', token);
    return url.toString();
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
   * Find or create a user from Zalo OAuth profile
   */
  async findOrCreateZaloUser(profile: IZaloProfile) {
    const existingAccount = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'zalo',
          providerAccountId: profile.zaloId,
        },
      },
      include: {
        user: true,
      },
    });

    if (existingAccount?.user) {
      // Update user info if new data is available
      const updateData: { image?: string; phone?: string } = {};
      if (!existingAccount.user.image && profile.image) {
        updateData.image = profile.image;
      }
      if (!existingAccount.user.phone && profile.phone) {
        updateData.phone = profile.phone;
      }

      if (Object.keys(updateData).length > 0) {
        return this.prisma.user.update({
          where: { id: existingAccount.user.id },
          data: updateData,
        });
      }
      return existingAccount.user;
    }

    // Use Zalo email if provided, otherwise generate fallback email
    const email = profile.email || `zalo_${profile.zaloId}@zalo.vmito.local`;

    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name: profile.name,
          image: profile.image,
          phone: profile.phone,
          role: 'PLAYER',
          emailVerified: new Date(),
        },
      });
    }

    await this.prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'zalo',
          providerAccountId: profile.zaloId,
        },
      },
      create: {
        userId: user.id,
        type: 'oauth',
        provider: 'zalo',
        providerAccountId: profile.zaloId,
      },
      update: {
        userId: user.id,
      },
    });

    return user;
  }

  /**
   * Find or create a user from Facebook OAuth profile
   *
   * Facebook (like Zalo) may not always return an email — users can deny the
   * email permission or have a phone-only account. So we link accounts via the
   * Account table (provider = 'facebook') and fall back to a generated email
   * when Facebook doesn't provide one.
   */
  /**
   * Find or create the user behind a verified Apple identity.
   *
   * Keyed on Apple's `sub` via the `accounts` table, **not** on email. Apple
   * lets a user hide their address behind a private relay, and that relay can
   * change; email is therefore not a stable identity. `sub` is stable for the
   * lifetime of the account against our team id.
   *
   * Two consequences worth knowing:
   * - the display name arrives only on the **first** authorization, so it is
   *   persisted the moment it appears and never overwritten afterwards;
   * - a user who already signed up with the same real address gets that
   *   account linked rather than a duplicate, but only when Apple actually
   *   discloses the address (not a relay).
   */
  async findOrCreateAppleUser(identity: {
    appleUserId: string;
    email?: string;
    emailVerified: boolean;
    isPrivateRelay: boolean;
    givenName?: string;
    familyName?: string;
  }) {
    const existingAccount = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'apple',
          providerAccountId: identity.appleUserId,
        },
      },
      include: { user: true },
    });

    if (existingAccount?.user) {
      const user = existingAccount.user;
      const displayName = this.buildAppleName(identity);

      // Backfill a name only if we never got one. Apple will not send it
      // again, so a placeholder must not overwrite a real name later.
      if (displayName && this.isPlaceholderName(user.name)) {
        return this.prisma.user.update({
          where: { id: user.id },
          data: { name: displayName },
        });
      }
      return user;
    }

    // A real (non-relay) address may already belong to an account created by
    // email or by another provider. Link rather than duplicate.
    const linkable =
      identity.email && !identity.isPrivateRelay
        ? await this.prisma.user.findUnique({
            where: { email: identity.email },
          })
        : null;

    const user =
      linkable ??
      (await this.prisma.user.create({
        data: {
          // Apple may withhold the address entirely on a repeat authorization
          // from a new device. A synthetic, non-routable address keeps the
          // unique constraint satisfiable without pretending to be reachable.
          email:
            identity.email ?? `apple_${identity.appleUserId}@users.vmito.local`,
          name: this.buildAppleName(identity) ?? 'Người dùng Apple',
          role: 'PLAYER',
          emailVerified: identity.emailVerified ? new Date() : null,
        },
      }));

    await this.prisma.account.create({
      data: {
        userId: user.id,
        type: 'oauth',
        provider: 'apple',
        providerAccountId: identity.appleUserId,
      },
    });

    return user;
  }

  private buildAppleName(identity: {
    givenName?: string;
    familyName?: string;
  }): string | null {
    const name = [identity.givenName, identity.familyName]
      .filter((part) => part && part.trim().length > 0)
      .join(' ')
      .trim();
    return name.length > 0 ? name : null;
  }

  private isPlaceholderName(name: string | null): boolean {
    return !name || name.trim().length === 0 || name === 'Người dùng Apple';
  }

  async findOrCreateFacebookUser(profile: IFacebookProfile) {
    const existingAccount = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'facebook',
          providerAccountId: profile.facebookId,
        },
      },
      include: {
        user: true,
      },
    });

    if (existingAccount?.user) {
      // Update user image if new data is available and user doesn't have one
      if (!existingAccount.user.image && profile.image) {
        return this.prisma.user.update({
          where: { id: existingAccount.user.id },
          data: { image: profile.image },
        });
      }
      return existingAccount.user;
    }

    // Use Facebook email if provided, otherwise generate a fallback email
    const email =
      profile.email || `facebook_${profile.facebookId}@facebook.vmito.local`;

    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name: profile.name,
          image: profile.image,
          role: 'PLAYER',
          emailVerified: new Date(),
        },
      });
    }

    await this.prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'facebook',
          providerAccountId: profile.facebookId,
        },
      },
      create: {
        userId: user.id,
        type: 'oauth',
        provider: 'facebook',
        providerAccountId: profile.facebookId,
      },
      update: {
        userId: user.id,
      },
    });

    return user;
  }

  /**
   * Generate JWT token for a user (used for OAuth flows)
   */
  async generateTokenForUser(user: {
    id: string;
    email: string;
    role: string;
  }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('auth.jwt.expiresIn') || '15m',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Generate a secure refresh token and store it in the database
   */
  async generateRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(40).toString('hex');
    const expiresInDays =
      parseInt(
        this.configService
          .get<string>('auth.jwt.refreshExpiresIn')
          ?.replace('d', '') || '7'
      ) || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });

    return token;
  }

  /**
   * Refresh access token using a refresh token
   */
  async refreshTokens(token: string) {
    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (refreshToken.revoked) {
      // Token reuse detection could be implemented here (revoke all user tokens)
      throw new UnauthorizedException('Refresh token revoked');
    }

    if (refreshToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Rotate refresh token: revoke old one, create new one
    await this.prisma.refreshToken.update({
      where: { id: refreshToken.id },
      data: { revoked: true },
    });

    const user = refreshToken.user;
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const newRefreshToken = await this.generateRefreshToken(user.id);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('auth.jwt.expiresIn') || '15m',
    };
  }
}
