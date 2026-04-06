import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  // Security middleware
  app.use(helmet());

  // CORS configuration
  const corsOrigin = configService.get<string[]>('app.cors.origin') ?? [
    'http://localhost:3000',
  ];
  app.enableCors({
    origin: corsOrigin,
    credentials: configService.get<boolean>('app.cors.credentials') ?? true,
  });

  // Disable caching for all API responses
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });

  // Static file serving for uploads
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // Global exception filters
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new LoggingInterceptor()
  );

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // Global prefix (exclude root and health check routes)
  app.setGlobalPrefix('api', {
    exclude: ['/', 'health', 'health/live', 'health/ready'],
  });

  // Swagger API Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Badminton Session Manager API')
    .setDescription(
      'API documentation for the Badminton Session Manager backend. ' +
        'This API provides endpoints for managing badminton sessions, players, courts, matches, and tournaments.'
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth'
    )
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management endpoints')
    .addTag('sessions', 'Session management endpoints')
    .addTag('players', 'Player management endpoints')
    .addTag('courts', 'Court management endpoints')
    .addTag('matches', 'Match management endpoints')
    .addTag('tournaments', 'Tournament management endpoints')
    .addTag('categories', 'Category management endpoints')
    .addTag('pwa', 'PWA support endpoints')
    .addTag('health', 'Health check endpoints')
    .build();

  // Only enable Swagger in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
    });
  }

  const port = configService.get<number>('app.port') || 3001;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(
    `Swagger documentation available at: http://localhost:${port}/api/docs`
  );
}
void bootstrap();
