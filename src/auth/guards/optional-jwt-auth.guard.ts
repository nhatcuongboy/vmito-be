import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Parses a bearer token when present while preserving genuinely public routes. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false | null,
    _info: unknown,
    _context: ExecutionContext
  ): TUser | undefined {
    if (err instanceof Error) throw err;
    if (err != null) throw new Error('Optional authentication failed');
    return user || undefined;
  }
}
