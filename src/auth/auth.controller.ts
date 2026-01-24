import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  role: string;
  image?: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {}

  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Put('change-password')
  async changePassword(
    @CurrentUser() user: { userId: string },
    @Body() changePasswordDto: ChangePasswordDto
  ) {
    if (!user || typeof user.userId !== 'string') {
      throw new Error('Invalid user object');
    }
    return this.authService.changePassword(user.userId, changePasswordDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('token')
  async getToken(@CurrentUser() user: { userId: string }) {
    if (!user || typeof user.userId !== 'string') {
      throw new Error('Invalid user object');
    }
    return this.authService.getToken(user.userId);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  /**
   * Initiate Google OAuth flow
   * Redirects user to Google consent screen
   */
  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleLogin() {
    // The locale is passed via state parameter by GoogleAuthGuard
    // This is handled automatically by passport-google-oauth20
  }

  /**
   * Handle Google OAuth callback
   * Creates/finds user and redirects to frontend with token
   */
  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() req: { user: GoogleUser & { locale?: string } },
    @Res() res: Response
  ) {
    const user = req.user;

    // Generate JWT token for the user
    const tokenData = await this.authService.generateTokenForUser({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    // Redirect to frontend with token in query params
    // Use locale from OAuth state, default to 'en'
    const frontendUrl = this.configService.get<string>('frontendUrl');
    const locale = user.locale || 'en';
    const callbackUrl = `${frontendUrl}/${locale}/auth/callback?token=${tokenData.accessToken}&refreshToken=${tokenData.refreshToken}&userId=${user.id}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name || '')}&role=${user.role}${user.image ? `&image=${encodeURIComponent(user.image)}` : ''}`;

    res.redirect(callbackUrl);
  }
}
