import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const exposeInternalDetails = process.env.NODE_ENV === 'development';

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Log full error details for debugging (server-side only)
    this.logger.error(
      `Exception: ${exception instanceof Error ? exception.message : 'Unknown error'}`,
      exception instanceof Error ? exception.stack : undefined
    );

    // In production, hide internal error details
    let message: string | object;
    if (exception instanceof HttpException) {
      message = exception.getResponse();
    } else if (exposeInternalDetails) {
      // Only a local development environment may return internal details.
      message =
        exception instanceof Error
          ? exception.message
          : 'Internal server error';
    } else {
      // Staging and production are public environments: keep details in logs.
      message = 'An unexpected error occurred';
    }

    response.status(status).json({
      success: false,
      error: typeof message === 'string' ? { message } : message,
      statusCode: status,
      timestamp: new Date().toISOString(),
    });
  }
}
