import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { BrowseClubsDto, JoinRequestDto } from '../fixed-members/dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';

interface JwtUser {
  userId: string;
  email: string;
  role: Role;
}

@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  /**
   * Browse public clubs
   * GET /clubs
   */
  @Get()
  async browseClubs(@Query() query: BrowseClubsDto) {
    return this.clubsService.browsePublicClubs(query);
  }

  /**
   * Get club details by ID
   * GET /clubs/:id
   */
  @Get(':id')
  async getClubDetails(@Param('id') id: string) {
    return this.clubsService.getClubDetails(id);
  }

  /**
   * Request to join a club
   * POST /clubs/:id/join
   */
  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  async requestToJoin(
    @Param('id') clubId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: JoinRequestDto
  ) {
    return this.clubsService.requestToJoinClub(
      clubId,
      user.userId,
      dto.message
    );
  }

  /**
   * Leave a club
   * DELETE /clubs/:id/leave
   */
  @Delete(':id/leave')
  @UseGuards(JwtAuthGuard)
  async leaveClub(@Param('id') clubId: string, @CurrentUser() user: JwtUser) {
    return this.clubsService.leaveClub(clubId, user.userId);
  }

  /**
   * Get clubs for current user
   * GET /clubs/my
   */
  @Get('my/list')
  @UseGuards(JwtAuthGuard)
  async getMyClubs(@CurrentUser() user: JwtUser) {
    return this.clubsService.getUserClubs(user.userId);
  }

  /**
   * Get pending join requests for current user
   * GET /clubs/my/requests
   */
  @Get('my/requests')
  @UseGuards(JwtAuthGuard)
  async getMyJoinRequests(@CurrentUser() user: JwtUser) {
    return this.clubsService.getUserJoinRequests(user.userId);
  }
}
