import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { Request } from 'express';
import { AuthService } from '../auth.service';

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  role: string;
  image?: string;
  locale?: string;
  returnUrl?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService
  ) {
    const clientID = configService.get<string>('auth.google.clientId');
    const clientSecret = configService.get<string>('auth.google.clientSecret');

    if (!clientID || !clientSecret) {
      console.warn(
        'WARNING: Google Auth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) are missing. Google Auth will fail if used.'
      );
    }

    super({
      clientID: clientID || 'MISSING_CLIENT_ID',
      clientSecret: clientSecret || 'MISSING_CLIENT_SECRET',
      callbackURL: configService.get<string>('auth.google.callbackURL')!,
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (error: Error | null, user?: GoogleUser) => void
  ): Promise<void> {
    const { emails, displayName, photos, id } = profile;

    const email = emails?.[0]?.value;
    if (!email) {
      done(new Error('No email found in Google profile'), undefined);
      return;
    }

    // Parse state parameter which contains locale and optionally returnUrl
    // State can be:
    // 1. Simple string: "en" (just locale)
    // 2. JSON string: {"locale":"en","returnUrl":"/browse/sessions?sessionId=xxx"}
    let locale = 'en';
    let returnUrl: string | undefined;
    
    const stateParam = req.query.state as string;
    if (stateParam) {
      try {
        // Try to parse as JSON first
        const stateData = JSON.parse(stateParam);
        locale = stateData.locale || 'en';
        returnUrl = stateData.returnUrl;
      } catch {
        // If not JSON, treat as simple locale string
        locale = stateParam;
      }
    }

    try {
      const user = await this.authService.findOrCreateGoogleUser({
        googleId: id,
        email,
        name: displayName,
        image: photos?.[0]?.value,
      });

      // Add locale and returnUrl to user object for use in callback
      done(null, { ...user, locale, returnUrl } as GoogleUser);
    } catch (error) {
      done(error as Error, undefined);
    }
  }
}
