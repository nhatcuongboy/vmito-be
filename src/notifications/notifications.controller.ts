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
import { BroadcastNotificationDto, QueryNotificationsDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';

interface ICurrentUser {
  id: string;
  email: string;
  role: Role;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Get all notifications for the current user
   */
  @Get()
  async findAll(
    @CurrentUser() user: ICurrentUser,
    @Query() query: QueryNotificationsDto
  ) {
    return this.notificationsService.findAll(user.id, query);
  }

  /**
   * Get unread notification count
   */
  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: ICurrentUser) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  /**
   * Mark a notification as read
   */
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @CurrentUser() user: ICurrentUser) {
    return this.notificationsService.markAsRead(id, user.id);
  }

  /**
   * Mark all notifications as read
   */
  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: ICurrentUser) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  /**
   * Delete a notification
   */
  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: ICurrentUser) {
    return this.notificationsService.delete(id, user.id);
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
