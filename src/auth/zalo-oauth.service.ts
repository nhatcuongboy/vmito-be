import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

interface IZaloStatePayload {
  locale: string;
  nonce: string;
  returnUrl?: string;
}

interface IZaloTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: number | string;
  error_name?: string;
  error_description?: string;
  message?: string;
}

interface IZaloProfileResponse {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  picture?: {
    data?: {
      url?: string;
    };
  };
  error?: number | string;
  message?: string;
}

interface IZaloCallbackResult {
  locale: string;
  returnUrl?: string;
  zaloId: string;
  name: string;
  image?: string;
  email?: string;
  phone?: string;
}

@Injectable()
export class ZaloOAuthService {
  private readonly logger = new Logger(ZaloOAuthService.name);

  private readonly verifierStore = new Map<
    string,
    { codeVerifier: string; expiresAt: number }
  >();

  constructor(private readonly configService: ConfigService) {}

  private base64UrlEncode(input: Buffer): string {
    return input
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private base64UrlDecode(input: string): string {
    try {
      // Restore padding if needed
      const padding = (4 - (input.length % 4)) % 4;
      const padded = input + '='.repeat(padding);
      // Restore original Base64 characters
      const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(base64, 'base64').toString('utf-8');
    } catch {
      throw new UnauthorizedException('Invalid state encoding');
    }
  }

  private cleanupExpiredVerifiers(): void {
    const now = Date.now();
    for (const [key, value] of this.verifierStore.entries()) {
      if (value.expiresAt <= now) {
        this.verifierStore.delete(key);
      }
    }
  }

  private generateCodeVerifier(): string {
    return this.base64UrlEncode(crypto.randomBytes(64));
  }

  private generateCodeChallenge(codeVerifier: string): string {
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    return this.base64UrlEncode(hash);
  }

  private truncateForLog(value: string): string {
    const MAX_LOG_LENGTH = 500;
    if (value.length <= MAX_LOG_LENGTH) {
      return value;
    }
    return `${value.slice(0, MAX_LOG_LENGTH)}...`;
  }

  private parseState(state?: string): IZaloStatePayload {
    if (!state) {
      throw new UnauthorizedException('Missing OAuth state');
    }

    let parsed: Partial<IZaloStatePayload>;
    try {
      // Decode from Base64 first, then parse JSON
      const decodedState = this.base64UrlDecode(state);
      parsed = JSON.parse(decodedState) as Partial<IZaloStatePayload>;
    } catch {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    if (!parsed.nonce) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    return {
      locale: parsed.locale || 'en',
      nonce: parsed.nonce,
      returnUrl: parsed.returnUrl,
    };
  }

  getAuthorizationUrl(locale = 'en', returnUrl?: string): string {
    this.cleanupExpiredVerifiers();

    const appId = this.configService.get<string>('auth.zalo.appId');
    const callbackURL = this.configService.get<string>('auth.zalo.callbackURL');

    if (!appId || !callbackURL) {
      throw new UnauthorizedException('Zalo OAuth is not configured');
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    this.verifierStore.set(nonce, {
      codeVerifier,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const statePayload: IZaloStatePayload = {
      locale,
      nonce,
      ...(returnUrl ? { returnUrl } : {}),
    };

    // Base64 URL-encode the state to avoid special characters being stripped by Zalo
    const stateJson = JSON.stringify(statePayload);
    const stateEncoded = this.base64UrlEncode(Buffer.from(stateJson, 'utf-8'));

    const params = new URLSearchParams({
      app_id: appId,
      redirect_uri: callbackURL,
      state: stateEncoded,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `https://oauth.zaloapp.com/v4/permission?${params.toString()}`;
  }

  async exchangeCodeAndGetProfile(
    code: string,
    state?: string
  ): Promise<IZaloCallbackResult> {
    const parsedState = this.parseState(state);
    const verifierData = this.verifierStore.get(parsedState.nonce);
    this.verifierStore.delete(parsedState.nonce);

    if (!verifierData || verifierData.expiresAt <= Date.now()) {
      throw new UnauthorizedException('OAuth state expired or invalid');
    }

    const appId = this.configService.get<string>('auth.zalo.appId');
    const secretKey = this.configService.get<string>('auth.zalo.secretKey');

    if (!appId || !secretKey) {
      throw new UnauthorizedException('Zalo OAuth is not configured');
    }

    const tokenBody = new URLSearchParams({
      app_id: appId,
      code,
      grant_type: 'authorization_code',
      code_verifier: verifierData.codeVerifier,
    });

    const tokenResponse = await fetch(
      'https://oauth.zaloapp.com/v4/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          secret_key: secretKey,
        },
        body: tokenBody.toString(),
      }
    );

    if (!tokenResponse.ok) {
      const rawTokenError = await tokenResponse.text();
      this.logger.warn('Zalo token exchange returned non-OK response', {
        status: tokenResponse.status,
        body: this.truncateForLog(rawTokenError),
      });
      throw new UnauthorizedException(
        'Failed to exchange Zalo authorization code'
      );
    }

    const tokenData = (await tokenResponse.json()) as IZaloTokenResponse;
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      this.logger.warn('Zalo token response missing access token', {
        error: tokenData.error,
        errorName: tokenData.error_name,
        errorDescription: tokenData.error_description,
        message: tokenData.message,
      });
      throw new UnauthorizedException('Missing Zalo access token');
    }

    const profileParams = new URLSearchParams({
      fields: 'id,name,picture,email,phone',
      access_token: accessToken,
    });

    const profileResponse = await fetch(
      `https://graph.zalo.me/v2.0/me?${profileParams.toString()}`
    );

    if (!profileResponse.ok) {
      const rawProfileError = await profileResponse.text();
      this.logger.warn('Zalo profile endpoint returned non-OK response', {
        status: profileResponse.status,
        body: this.truncateForLog(rawProfileError),
      });
      throw new UnauthorizedException('Failed to fetch Zalo profile');
    }

    const profile = (await profileResponse.json()) as IZaloProfileResponse;
    if (!profile.id) {
      this.logger.warn('Zalo profile response missing id', {
        error: profile.error,
        message: profile.message,
        hasName: Boolean(profile.name),
        hasEmail: Boolean(profile.email),
        hasPhone: Boolean(profile.phone),
      });
      throw new UnauthorizedException('Invalid Zalo profile response');
    }

    return {
      locale: parsedState.locale,
      returnUrl: parsedState.returnUrl,
      zaloId: profile.id,
      name: profile.name || `Zalo User ${profile.id.slice(-6)}`,
      image: profile.picture?.data?.url,
      email: profile.email,
      phone: profile.phone,
    };
  }
}
