import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';
import { Request } from 'express';
import { AuthService } from '../auth.service';

interface FacebookUser {
  id: string;
  email: string;
  name: string;
  role: string;
  image?: string;
  locale?: string;
  returnUrl?: string;
}

interface StateData {
  locale?: string;
  returnUrl?: string;
}

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService
  ) {
    const clientID = configService.get<string>('auth.facebook.clientId');
    const clientSecret = configService.get<string>(
      'auth.facebook.clientSecret'
    );

    if (!clientID || !clientSecret) {
      console.warn(
        'WARNING: Facebook Auth credentials (FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET) are missing. Facebook Auth will fail if used.'
      );
    }

    super({
      clientID: clientID || 'MISSING_CLIENT_ID',
      clientSecret: clientSecret || 'MISSING_CLIENT_SECRET',
      callbackURL: configService.get<string>('auth.facebook.callbackURL')!,
      scope: ['email'],
      profileFields: ['id', 'displayName', 'emails', 'photos'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (error: Error | null, user?: FacebookUser) => void
  ): Promise<void> {
    const { emails, displayName, photos, id } = profile;

    const email = emails?.[0]?.value;

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
        const stateData = JSON.parse(stateParam) as StateData;
        locale = stateData.locale || 'en';
        returnUrl = stateData.returnUrl;
      } catch {
        // If not JSON, treat as simple locale string
        locale = stateParam;
      }
    }

    try {
      const user = await this.authService.findOrCreateFacebookUser({
        facebookId: id,
        email,
        name: displayName,
        image: photos?.[0]?.value,
      });

      // Add locale and returnUrl to user object for use in callback
      done(null, { ...user, locale, returnUrl } as FacebookUser);
    } catch (error) {
      done(error as Error, undefined);
    }
  }
}
