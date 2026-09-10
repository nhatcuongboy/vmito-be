import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import {
  BroadcastNotificationDto,
  QueryAdminNotificationsDto,
  QueryBroadcastNotificationsDto,
  QueryNotificationsDto,
  RegisterNotificationDeviceDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** List shared admin broadcast campaigns without expanding recipients. */
  @Get('admin/broadcasts')
  @UseGuards(AdminGuard)
  async findBroadcastsForAdmin(@Query() query: QueryBroadcastNotificationsDto) {
    return this.notificationsService.findBroadcastsForAdmin(query);
  }

  /**
   * Get all notifications across the system (Admin only)
   */
  @Get('admin')
  @UseGuards(AdminGuard)
  async findAllForAdmin(@Query() query: QueryAdminNotificationsDto) {
    return this.notificationsService.findAllForAdmin(query);
  }

  /**
   * Get all notifications for the current user
   */
  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryNotificationsDto
  ) {
    return this.notificationsService.findAll(user.userId, query);
  }

  /**
   * Get unread notification count
   */
  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getUnreadCount(user.userId);
  }

  /** Register or refresh the current mobile installation's FCM token. */
  @Post('devices')
  async registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterNotificationDeviceDto
  ) {
    return this.notificationsService.registerDevice(user.userId, dto);
  }

  /** Remove an FCM token on logout or when push is disabled. */
  @Delete('devices/:token')
  async unregisterDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string
  ) {
    return this.notificationsService.unregisterDevice(user.userId, token);
  }

  /**
   * Mark a notification as read
   */
  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.notificationsService.markAsRead(id, user.userId);
  }

  /**
   * Mark all notifications as read
   */
  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllAsRead(user.userId);
  }

  /**
   * Delete any notification as admin
   */
  @Delete('admin/:id')
  @UseGuards(AdminGuard)
  async deleteAsAdmin(@Param('id') id: string) {
    return this.notificationsService.deleteAsAdmin(id);
  }

  /** Soft-delete a shared broadcast for its entire audience. */
  @Delete('admin/broadcasts/:id')
  @UseGuards(AdminGuard)
  async deleteBroadcastAsAdmin(@Param('id') id: string) {
    return this.notificationsService.deleteBroadcastAsAdmin(id);
  }

  /**
   * Delete all notifications for the current user
   */
  @Delete()
  async deleteAll(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.deleteAll(user.userId);
  }

  /**
   * Delete a notification
   */
  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.notificationsService.delete(id, user.userId);
  }

  /**
   * Broadcast a notification to all users (Admin only)
   */
  @Post('broadcast')
  @UseGuards(AdminGuard)
  async broadcast(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: BroadcastNotificationDto
  ) {
    return this.notificationsService.broadcastToAll(
      user.userId,
      dto,
      idempotencyKey
    );
  }
}
