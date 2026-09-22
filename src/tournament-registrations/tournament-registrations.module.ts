import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TournamentAccessModule } from '../common/tournament-access/tournament-access.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TournamentRegistrationsController } from './tournament-registrations.controller';
import { MyTournamentRegistrationsController } from './my-tournament-registrations.controller';
import { TournamentRegistrationReviewController } from './tournament-registration-review.controller';
import { TournamentRegistrationsService } from './tournament-registrations.service';
import { TournamentRegistrationReviewService } from './tournament-registration-review.service';
import { TournamentRegistrationNotifier } from './tournament-registration.notifier';

@Module({
  imports: [PrismaModule, TournamentAccessModule, NotificationsModule],
  controllers: [
    TournamentRegistrationsController,
    TournamentRegistrationReviewController,
    MyTournamentRegistrationsController,
  ],
  providers: [
    TournamentRegistrationsService,
    TournamentRegistrationReviewService,
    TournamentRegistrationNotifier,
  ],
})
export class TournamentRegistrationsModule {}
