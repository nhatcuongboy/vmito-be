import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogAction } from '@prisma/client';

/**
 * Global exception filter that writes every unhandled error to the audit log.
 * Register as APP_FILTER in AppModule to catch all exceptions.
 */
@Catch()
export class AuditLogExceptionFilter implements ExceptionFilter {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof Error ? exception.message : 'Unknown error';

    // Fire-and-forget: don't await, don't let logging failure block the response
    this.auditLogsService.create({
      action: AuditLogAction.ERROR,
      requestMethod: request.method,
      requestUrl: request.url,
      responseStatusCode: status,
      errorMessage: message,
      userId: (request.user as { userId?: string })?.userId,
      userEmail: (request.user as { email?: string })?.email,
      userName: (request.user as { name?: string })?.name,
      ipAddress: typeof request.ip === 'string' ? request.ip : undefined,
      userAgent: request.headers['user-agent'],
    });

    // Preserve the existing AllExceptionsFilter behavior
    response.status(status).json({
      success: false,
      error: { message },
      statusCode: status,
      timestamp: new Date().toISOString(),
    });
  }
}
