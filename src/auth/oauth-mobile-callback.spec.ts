import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AppleIdentityService } from './apple-identity.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FacebookAuthGuard } from './guards/facebook-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { ZaloOAuthService } from './zalo-oauth.service';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

const contextWithQuery = (query: Record<string, string>): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ query }),
    }),
  }) as unknown as ExecutionContext;

describe('mobile OAuth callback', () => {
  it.each([
    ['Google', new GoogleAuthGuard()],
    ['Facebook', new FacebookAuthGuard()],
  ])('preserves the mobile flag in %s OAuth state', (_name, guard) => {
    const options = guard.getAuthenticateOptions(
      contextWithQuery({ locale: 'vi', mobile: '1' })
    );

    expect(JSON.parse(options.state)).toEqual({
      locale: 'vi',
      mobile: true,
    });
  });

  it('redirects a successful mobile Google login back to the app', async () => {
    const authService = {
      generateTokenForUser: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    } as unknown as AuthService;
    const configService = {
      get: jest.fn().mockReturnValue('https://vmito.com'),
    } as unknown as ConfigService;
    const controller = new AuthController(
      authService,
      configService,
      {} as ZaloOAuthService,
      {} as AppleIdentityService
    );
    const redirect = jest.fn();
    const response = { redirect } as unknown as Response;

    await controller.googleCallback(
      {
        user: {
          id: 'user-1',
          email: 'player@example.com',
          name: 'Player',
          role: 'PLAYER',
          locale: 'vi',
          mobile: true,
        },
      },
      response
    );

    expect(redirect).toHaveBeenCalledWith(
      'vmito://auth/callback?token=access-token&refreshToken=refresh-token&' +
        'userId=user-1&email=player%40example.com&name=Player&role=PLAYER'
    );
  });

  it('keeps the existing website callback for a web Google login', async () => {
    const authService = {
      generateTokenForUser: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    } as unknown as AuthService;
    const configService = {
      get: jest.fn().mockReturnValue('https://vmito.com'),
    } as unknown as ConfigService;
    const controller = new AuthController(
      authService,
      configService,
      {} as ZaloOAuthService,
      {} as AppleIdentityService
    );
    const redirect = jest.fn();

    await controller.googleCallback(
      {
        user: {
          id: 'user-1',
          email: 'player@example.com',
          name: 'Player',
          role: 'PLAYER',
          locale: 'vi',
        },
      },
      { redirect } as unknown as Response
    );

    expect(redirect).toHaveBeenCalledWith(
      'https://vmito.com/vi/auth/callback?token=access-token&' +
        'refreshToken=refresh-token&userId=user-1&' +
        'email=player%40example.com&name=Player&role=PLAYER'
    );
  });
});
