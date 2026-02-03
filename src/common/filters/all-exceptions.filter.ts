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
    const isProduction = process.env.NODE_ENV === 'production';

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
    } else if (isProduction) {
      // Generic message for production - don't expose internal details
      message = 'An unexpected error occurred';
    } else {
      // In development, show error message for debugging
      message =
        exception instanceof Error
          ? exception.message
          : 'Internal server error';
    }

    response.status(status).json({
      success: false,
      error: typeof message === 'string' ? { message } : message,
      statusCode: status,
      timestamp: new Date().toISOString(),
    });
  }
}
