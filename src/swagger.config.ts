import { DocumentBuilder } from '@nestjs/swagger';

/**
 * Shared OpenAPI document configuration.
 *
 * Used by both `main.ts` (which serves it at `/api/docs`) and
 * `scripts/export-openapi.ts` (which writes it to a file for the Flutter
 * client's DTO codegen). Keeping one definition means the served docs and the
 * exported contract can never disagree.
 *
 * Field-level metadata — types, nullability, enums — comes from the
 * `@nestjs/swagger` CLI plugin enabled in `nest-cli.json`, not from here.
 * Without that plugin most DTOs export as empty objects.
 */
export const buildSwaggerConfig = () =>
  new DocumentBuilder()
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
