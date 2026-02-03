import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    // Get locale and returnUrl from query params
    const locale = (request.query.locale as string) || 'en';
    const returnUrl = request.query.returnUrl as string;

    // Encode both locale and returnUrl in state parameter as JSON
    // If no returnUrl, just use locale string for backward compatibility
    const state = returnUrl ? JSON.stringify({ locale, returnUrl }) : locale;

    return {
      state,
    };
  }
}
