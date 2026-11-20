import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { NotificationsService } from './notifications.service';
import { RegisterNotificationDeviceDto } from './dto';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Public on purpose: a signed-out install has no JWT but still opted in to
 * push at onboarding. These rows only ever receive general admin broadcasts
 * (see NotificationDispatchService); nothing user-specific targets them.
 */
@Public()
@Controller('notifications/guest-devices')
export class GuestDevicesController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async register(@Body() dto: RegisterNotificationDeviceDto) {
    return this.notificationsService.registerGuestDevice(dto);
  }

  @Delete(':token')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async unregister(@Param('token') token: string) {
    return this.notificationsService.unregisterGuestDevice(token);
  }
}
