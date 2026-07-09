import { Module } from '@nestjs/common';
import { TournamentAccessService } from './tournament-access.service';

// PrismaService is provided by the global PrismaModule, so this module only
// needs to expose the shared access service to the feature modules.
@Module({
  providers: [TournamentAccessService],
  exports: [TournamentAccessService],
})
export class TournamentAccessModule {}
