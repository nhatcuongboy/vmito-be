import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogAction } from '@prisma/client';

/**
 * Interceptor that automatically writes HTTP request audit logs.
 * Only logs non-GET requests (mutations) and error responses to avoid noise.
 * Attach per-controller or globally.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, user, ip, headers } = request;
    const startMs = Date.now();

    // Skip GET/HEAD/OPTIONS — too noisy for audit logging
    const shouldLog = !['GET', 'HEAD', 'OPTIONS'].includes(method);

    return next.handle().pipe(
      tap({
        next: () => {
          if (!shouldLog) return;

          const response = context.switchToHttp().getResponse<Response>();
          const durationMs = Date.now() - startMs;

          this.auditLogsService.create({
            action: AuditLogAction.HTTP_REQUEST,
            requestMethod: method,
            requestUrl: url,
            responseStatusCode: response.statusCode,
            durationMs,
            userId: (user as { userId?: string })?.userId,
            userEmail: (user as { email?: string })?.email,
            userName: (user as { name?: string })?.name,
            ipAddress: typeof ip === 'string' ? ip : undefined,
            userAgent: headers['user-agent'],
          });
        },
        error: (error: Error) => {
          if (!shouldLog) return;

          const durationMs = Date.now() - startMs;

          this.auditLogsService.create({
            action: AuditLogAction.ERROR,
            requestMethod: method,
            requestUrl: url,
            durationMs,
            errorMessage: error.message,
            userId: (user as { userId?: string })?.userId,
            userEmail: (user as { email?: string })?.email,
            userName: (user as { name?: string })?.name,
            ipAddress: typeof ip === 'string' ? ip : undefined,
            userAgent: headers['user-agent'],
          });
        },
      })
    );
  }
}
