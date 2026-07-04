import { Module } from '@nestjs/common';
import { SessionAccessService } from './session-access.service';

// PrismaService is provided by the global PrismaModule, so this module only
// needs to expose the shared access service to the feature modules.
@Module({
  providers: [SessionAccessService],
  exports: [SessionAccessService],
})
export class SessionAccessModule {}
