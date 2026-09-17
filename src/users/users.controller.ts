import {
  Controller,
  HttpCode,
  HttpStatus,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ChatService } from '../chat/chat.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly chatService: ChatService
  ) {}

  /**
   * Get all users (Admin or Host)
   */
  @Get()
  findAll(
    @CurrentUser() user: { role: string },
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('gender') gender?: string,
    @Query('provider') provider?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    if (
      user.role !== 'ADMIN' &&
      user.role !== 'HOST' &&
      user.role !== 'PLAYER' &&
      user.role !== 'REFEREE'
    ) {
      throw new ForbiddenException(
        'Admin, Host, Player or Referee access required'
      );
    }
    return this.usersService.findAll({
      search,
      role,
      gender,
      provider,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * Get count of unread posts in newsfeed.
   * Returns the number of posts created by other users since lastSeenFeedAt.
   */
  @Get('unread-feed-count')
  async getUnreadFeedCount(@CurrentUser() currentUser: { userId: string }) {
    const count = await this.usersService.getUnreadFeedCount(
      currentUser.userId
    );
    return { count };
  }

  /**
   * Mark newsfeed as read for the current user.
   * Updates lastSeenFeedAt so unread count resets to 0.
   */
  @Post('mark-feed-as-read')
  @HttpCode(HttpStatus.OK)
  async markFeedAsRead(@CurrentUser() currentUser: { userId: string }) {
    await this.usersService.markFeedAsRead(currentUser.userId);
    return { success: true };
  }

  @Get('blocked')
  async getBlockedUsers(@CurrentUser() currentUser: { userId: string }) {
    return this.usersService.listBlockedUsers(currentUser.userId);
  }

  @Post('blocked/:id')
  async blockUser(
    @Param('id') id: string,
    @CurrentUser() currentUser: { userId: string }
  ) {
    return this.usersService.blockUser(currentUser.userId, id);
  }

  @Delete('blocked/:id')
  async unblockUser(
    @Param('id') id: string,
    @CurrentUser() currentUser: { userId: string }
  ) {
    return this.usersService.unblockUser(currentUser.userId, id);
  }

  /**
   * Get single user by ID
   */
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: { userId: string; role?: string }
  ) {
    // Only admin can view other users, regular users can only view themselves
    if (id !== currentUser.userId && currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('Access denied');
    }
    return this.usersService.findOne(id);
  }

  /**
   * Get basic public info for a user
   */
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('public/:id')
  async getPublicProfile(
    @Param('id') id: string,
    @Req() request: { user?: AuthenticatedUser }
  ) {
    const [profile, chatMode] = await Promise.all([
      this.usersService.getPublicProfile(id),
      this.chatService.getPublicChatMode(request.user?.userId, id),
    ]);
    return { ...profile, chatMode };
  }

  /**
   * Create new user (Admin only)
   */
  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  /**
   * Update user (Admin only, or self)
   */
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: { userId: string; role?: string }
  ) {
    // Admin can update anyone, users can only update themselves
    if (id !== currentUser.userId && currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('Unauthorized to update this user');
    }

    // Non-admin cannot change role
    if (updateUserDto.role && currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('Only admin can change user role');
    }

    return this.usersService.update(id, updateUserDto);
  }

  /**
   * Delete the caller's own account.
   *
   * Declared **before** `@Delete(':id')` on purpose: Nest matches routes in
   * declaration order, so the parameterised route would otherwise swallow
   * `me` and try to delete a user with that id.
   *
   * Required by App Store Review Guideline 5.1.1(v) for any app that allows
   * account creation. See `UsersService.deleteOwnAccount` for exactly what is
   * removed and what is retained.
   */
  @Delete('me')
  @HttpCode(HttpStatus.OK)
  deleteOwnAccount(@CurrentUser() currentUser: { userId: string }) {
    return this.usersService.deleteOwnAccount(currentUser.userId);
  }

  /**
   * Delete user (Admin only)
   */
  @Delete(':id')
  @UseGuards(AdminGuard)
  delete(
    @Param('id') id: string,
    @CurrentUser() currentUser: { userId: string }
  ) {
    // Prevent self-deletion
    if (id === currentUser.userId) {
      throw new ForbiddenException('Cannot delete your own account');
    }
    return this.usersService.delete(id);
  }
}
