import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SessionsModule } from './sessions/sessions.module';
import { PlayersModule } from './players/players.module';
import { CourtsModule } from './courts/courts.module';
import { MatchesModule } from './matches/matches.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { CategoriesModule } from './categories/categories.module';
import { SponsorsModule } from './sponsors/sponsors.module';
import { CategoryMatchesModule } from './category-matches/category-matches.module';
import { PwaModule } from './pwa/pwa.module';
import { TasksModule } from './tasks/tasks.module';
import { VenuesModule } from './venues/venues.module';
import { FeeModule } from './fee/fee.module';
import { PaymentSettingsModule } from './payment-settings/payment-settings.module';
import { PaymentsModule } from './payments/payments.module';
import { UploadsModule } from './uploads/uploads.module';
import { RatingsModule } from './ratings/ratings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ClubsModule } from './clubs/clubs.module';
import { UserImagesModule } from './user-images/user-images.module';
import { PostsModule } from './posts/posts.module';
import { FeedbackModule } from './feedback/feedback.module';
import { VenueRequestsModule } from './venue-requests/venue-requests.module';
import { MailModule } from './mail/mail.module';
import { LevelDescriptionsModule } from './level-descriptions/level-descriptions.module';
import { ViewsModule } from './views/views.module';
import { UmpiresModule } from './umpires/umpires.module';
import { TournamentManagersModule } from './tournament-managers/tournament-managers.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { FavoritesModule } from './favorites/favorites.module';
import { VenueRentalsModule } from './venue-rentals/venue-rentals.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { UserOrIpThrottlerGuard } from './common/guards/user-or-ip-throttler.guard';
import configuration from './config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      envFilePath: ['.env.local', '.env'],
    }),
    // 300 req/min per user (or IP for unauthenticated) – generous enough for
    // normal page navigation (each page loads 3-6 parallel API calls) while
    // still protecting against scripted abuse.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    SessionsModule,
    PlayersModule,
    CourtsModule,
    MatchesModule,
    TournamentsModule,
    CategoriesModule,
    SponsorsModule,
    CategoryMatchesModule,
    TasksModule,
    PwaModule,
    VenuesModule,
    FeeModule,
    PaymentSettingsModule,
    PaymentsModule,
    UploadsModule,
    RatingsModule,
    NotificationsModule,
    ClubsModule,
    UserImagesModule,
    PostsModule,
    MailModule,
    FeedbackModule,
    VenueRequestsModule,
    LevelDescriptionsModule,
    ViewsModule,
    UmpiresModule,
    TournamentManagersModule,
    WebhooksModule,
    FavoritesModule,
    VenueRentalsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // JwtAuthGuard must run BEFORE the throttler so req.user is populated and
    // the throttler can bucket by user id (see UserOrIpThrottlerGuard).
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: UserOrIpThrottlerGuard,
    },
  ],
})
export class AppModule {}
