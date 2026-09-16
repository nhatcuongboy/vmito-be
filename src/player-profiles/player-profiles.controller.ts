import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PlayerProfilesService } from './player-profiles.service';
import {
  CreatePlayerProfileDto,
  UpdatePlayerProfileDto,
  PromotePlayerProfileDto,
  QueryPlayerProfileDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('player-profiles')
@UseGuards(JwtAuthGuard)
export class PlayerProfilesController {
  constructor(private readonly profilesService: PlayerProfilesService) {}

  /**
   * Create a new player profile in roster
   */
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePlayerProfileDto
  ) {
    return this.profilesService.create(user.userId, dto, user.role);
  }

  /**
   * Get host's player profiles (with optional clubId and search filters)
   */
  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPlayerProfileDto
  ) {
    return this.profilesService.findAll(user.userId, query);
  }

  /**
   * Get single player profile
   */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.profilesService.findOne(id, user.userId, user.role);
  }

  /**
   * Get cross-session statistics for a player profile
   */
  @Get(':id/stats')
  async getStats(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.profilesService.getStats(id, user.userId, user.role);
  }

  /**
   * Update player profile
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePlayerProfileDto
  ) {
    return this.profilesService.update(id, user.userId, dto, user.role);
  }

  /**
   * Delete or archive player profile
   */
  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.profilesService.delete(id, user.userId, user.role);
  }

  /**
   * Promote player profile to full User account
   */
  @Post(':id/promote')
  async promote(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PromotePlayerProfileDto
  ) {
    return this.profilesService.promote(id, user.userId, dto, user.role);
  }
}
