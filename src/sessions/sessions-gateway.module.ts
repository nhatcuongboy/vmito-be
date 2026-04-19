import { Module } from '@nestjs/common';
import { SessionsGateway } from './sessions.gateway';

@Module({
  providers: [SessionsGateway],
  exports: [SessionsGateway],
})
export class SessionsGatewayModule {}
