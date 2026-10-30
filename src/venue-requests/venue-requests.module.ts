import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { VenuesModule } from '../venues/venues.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VenueRequestsController } from './venue-requests.controller';
import { VenueOwnershipClaimsService } from './venue-ownership-claims.service';
import { VenueRequestsService } from './venue-requests.service';

@Module({
  imports: [PrismaModule, VenuesModule, NotificationsModule, AuditLogsModule],
  controllers: [VenueRequestsController],
  providers: [VenueRequestsService, VenueOwnershipClaimsService],
})
export class VenueRequestsModule {}
