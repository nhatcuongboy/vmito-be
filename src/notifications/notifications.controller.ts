import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import {
  BroadcastNotificationDto,
  QueryAdminNotificationsDto,
  QueryNotificationsDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

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
  async broadcast(@Body() dto: BroadcastNotificationDto) {
    return this.notificationsService.broadcastToAll(dto);
  }
}
