import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
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
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { ZaloOAuthService } from './zalo-oauth.service';

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  role: string;
  image?: string;
}

interface IZaloCallbackUser {
  id: string;
  email: string;
  name: string;
  role: string;
  image?: string;
  phone?: string;
  locale?: string;
  returnUrl?: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly zaloOAuthService: ZaloOAuthService
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body() registerDto: RegisterDto,
    @Query('locale') locale?: string
  ) {
    return this.authService.register(registerDto, locale);
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
  @Put('admin/reset-password')
  async adminResetPassword(@Body() resetPasswordDto: AdminResetPasswordDto) {
    return this.authService.adminResetPassword(resetPasswordDto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Public()
  @Put('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
    @Req() req: { user: GoogleUser & { locale?: string; returnUrl?: string } },
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
    const returnUrl = user.returnUrl;

    let callbackUrl = `${frontendUrl}/${locale}/auth/callback?token=${tokenData.accessToken}&refreshToken=${tokenData.refreshToken}&userId=${user.id}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name || '')}&role=${user.role}${user.image ? `&image=${encodeURIComponent(user.image)}` : ''}`;

    // Add returnUrl if present
    if (returnUrl) {
      callbackUrl += `&returnUrl=${encodeURIComponent(returnUrl)}`;
    }

    res.redirect(callbackUrl);
  }

  /**
   * Initiate Zalo OAuth v4 flow
   */
  @Public()
  @Get('zalo')
  zaloLogin(
    @Req() req: { query: { locale?: string; returnUrl?: string } },
    @Res() res: Response
  ) {
    const locale = req.query.locale || 'en';
    const returnUrl = req.query.returnUrl;
    const authorizationUrl = this.zaloOAuthService.getAuthorizationUrl(
      locale,
      returnUrl
    );

    res.redirect(authorizationUrl);
  }

  /**
   * Handle Zalo OAuth callback
   */
  @Public()
  @Get('zalo/callback')
  async zaloCallback(
    @Req() req: { query: { code?: string; state?: string } },
    @Res() res: Response
  ) {
    const code = req.query.code;
    if (!code) {
      throw new BadRequestException('Missing Zalo authorization code');
    }

    const zaloProfile = await this.zaloOAuthService.exchangeCodeAndGetProfile(
      code,
      req.query.state
    );

    const user = await this.authService.findOrCreateZaloUser({
      zaloId: zaloProfile.zaloId,
      name: zaloProfile.name,
      image: zaloProfile.image,
      email: zaloProfile.email,
      phone: zaloProfile.phone,
    });

    const callbackUser: IZaloCallbackUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      ...(user.image ? { image: user.image } : {}),
      ...(user.phone ? { phone: user.phone } : {}),
      locale: zaloProfile.locale,
      ...(zaloProfile.returnUrl ? { returnUrl: zaloProfile.returnUrl } : {}),
    };

    const tokenData = await this.authService.generateTokenForUser({
      id: callbackUser.id,
      email: callbackUser.email,
      role: callbackUser.role,
    });

    const frontendUrl = this.configService.get<string>('frontendUrl');
    const locale = callbackUser.locale || 'en';
    const returnUrl = callbackUser.returnUrl;

    let callbackUrl = `${frontendUrl}/${locale}/auth/callback?token=${tokenData.accessToken}&refreshToken=${tokenData.refreshToken}&userId=${callbackUser.id}&email=${encodeURIComponent(callbackUser.email)}&name=${encodeURIComponent(callbackUser.name || '')}&role=${callbackUser.role}${callbackUser.image ? `&image=${encodeURIComponent(callbackUser.image)}` : ''}${callbackUser.phone ? `&phone=${encodeURIComponent(callbackUser.phone)}` : ''}`;

    if (returnUrl) {
      callbackUrl += `&returnUrl=${encodeURIComponent(returnUrl)}`;
    }

    res.redirect(callbackUrl);
  }
}
