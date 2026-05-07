import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SessionsGateway } from './sessions.gateway';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('auth.jwt.secret') || 'your-secret-key',
      }),
    }),
  ],
  providers: [SessionsGateway],
  exports: [SessionsGateway],
})
export class SessionsGatewayModule {}
