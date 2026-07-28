import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

/** Apple's stable identity for one user, taken from a verified token. */
export interface AppleIdentity {
  /** Apple's `sub`. Stable per (user, developer team) — the only safe key. */
  appleUserId: string;

  /**
   * May be a private-relay address (`…@privaterelay.appleid.com`), and may be
   * absent when the user hid it and this is not the first authorization.
   */
  email?: string;

  emailVerified: boolean;

  /** True when the address is an Apple relay rather than the real inbox. */
  isPrivateRelay: boolean;
}

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');

/**
 * Verifies "Sign in with Apple" identity tokens.
 *
 * The token is a JWT signed by Apple. Verifying it means checking the
 * signature against Apple's published JWKS **and** the claims — a signature
 * check alone would accept a token minted for a different app.
 *
 * `createRemoteJWKSet` caches the key set and refetches on an unknown `kid`,
 * so key rotation needs no deploy.
 */
@Injectable()
export class AppleIdentityService {
  private readonly logger = new Logger(AppleIdentityService.name);
  private readonly jwks = createRemoteJWKSet(APPLE_JWKS_URL);

  constructor(private readonly configService: ConfigService) {}

  async verifyIdentityToken(identityToken: string): Promise<AppleIdentity> {
    const audiences =
      this.configService.get<string[]>('auth.apple.audiences') ?? [];

    if (audiences.length === 0) {
      // Failing closed: with no audience configured, any Apple token from any
      // app would validate, which is an authentication bypass.
      this.logger.error('APPLE_AUDIENCES is not configured');
      throw new UnauthorizedException('Apple sign-in is not configured');
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(identityToken, this.jwks, {
        issuer: APPLE_ISSUER,
        audience: audiences,
      }));
    } catch (error) {
      // The reason stays in the log: telling a caller *why* a token failed
      // helps them forge a better one.
      this.logger.warn(
        `Apple identity token rejected: ${
          error instanceof Error ? error.message : 'unknown error'
        }`
      );
      throw new UnauthorizedException('Invalid Apple identity token');
    }

    const appleUserId = payload.sub;
    if (!appleUserId) {
      throw new UnauthorizedException('Apple identity token has no subject');
    }

    const email = typeof payload.email === 'string' ? payload.email : undefined;

    return {
      appleUserId,
      email,
      // Apple sends this as a boolean or the string "true" depending on flow.
      emailVerified:
        payload.email_verified === true || payload.email_verified === 'true',
      isPrivateRelay:
        payload.is_private_email === true ||
        payload.is_private_email === 'true',
    };
  }
}
