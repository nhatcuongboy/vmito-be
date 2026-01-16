import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Get all users (Admin or Host)
   */
  @Get()
  findAll(
    @CurrentUser() user: { role: string },
    @Query('search') search?: string,
    @Query('role') role?: string
  ) {
    if (user.role !== 'ADMIN' && user.role !== 'HOST') {
      throw new ForbiddenException('Admin or Host access required');
    }
    return this.usersService.findAll({ search, role });
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

