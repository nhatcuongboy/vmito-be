import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ClubsService } from './clubs.service';
import {
  CreateClubDto,
  UpdateClubDto,
  CreateClubFeeDto,
  BrowseClubsDto,
  UpdateMemberRoleDto,
  RejectJoinRequestDto,
  JoinRequestDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlayerVipGuard } from '../auth/guards/player-vip.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface JwtUser {
  userId: string;
  email: string;
  role: Role;
}

@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  // ===========================================
  // Public / Player Endpoints
  // ===========================================

  /**
   * Browse public clubs
   */
  @Public()
  @Get()
  async browseClubs(@Query() query: BrowseClubsDto) {
    return this.clubsService.browsePublicClubs(query);
  }

  /**
   * Get club details by ID (Public)
   */
  @Public()
  @Get(':id/details')
  async getClubDetails(@Param('id') id: string) {
    return this.clubsService.getClubDetails(id);
  }

  /**
   * Request to join a club
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
   */
  @Delete(':id/leave')
  @UseGuards(JwtAuthGuard)
  async leaveClub(@Param('id') clubId: string, @CurrentUser() user: JwtUser) {
    return this.clubsService.leaveClub(clubId, user.userId);
  }

  /**
   * Get clubs for current user
   */
  @Get('my/list')
  @UseGuards(JwtAuthGuard)
  async getMyClubs(@CurrentUser() user: JwtUser) {
    return this.clubsService.getUserClubs(user.userId);
  }

  /**
   * Get pending join requests for current user
   */
  @Get('my/requests')
  @UseGuards(JwtAuthGuard)
  async getMyJoinRequests(@CurrentUser() user: JwtUser) {
    return this.clubsService.getUserJoinRequests(user.userId);
  }

  // ===========================================
  // Club Management Endpoints (Host/Admin)
  // ===========================================

  @Get('manage')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async getClubs(@CurrentUser() user: JwtUser) {
    return this.clubsService.getClubs(user.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async createClub(@CurrentUser() user: JwtUser, @Body() dto: CreateClubDto) {
    return this.clubsService.createClub(user.userId, user.role, dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async getClub(@Param('id') clubId: string, @CurrentUser() user: JwtUser) {
    return this.clubsService.getClub(clubId, user.userId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async updateClub(
    @Param('id') clubId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateClubDto
  ) {
    return this.clubsService.updateClub(clubId, user.userId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async deleteClub(@Param('id') clubId: string, @CurrentUser() user: JwtUser) {
    return this.clubsService.deleteClub(clubId, user.userId);
  }

  // ===========================================
  // Member Endpoints
  // ===========================================

  @Get(':id/members')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async getClubMembers(
    @Param('id') clubId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.clubsService.getClubMembers(clubId, user.userId);
  }

  @Post(':id/members/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async addMemberToClub(
    @Param('id') clubId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.clubsService.addMemberToClub(clubId, userId, user.userId);
  }

  @Delete(':id/members/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async removeMemberFromClub(
    @Param('id') clubId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.clubsService.removeMemberFromClub(clubId, userId, user.userId);
  }

  @Put(':id/members/:userId/role')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async updateMemberRole(
    @Param('id') clubId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateMemberRoleDto
  ) {
    return this.clubsService.updateMemberRole(
      clubId,
      userId,
      user.userId,
      dto.role
    );
  }

  // ===========================================
  // Join Request Management Endpoints
  // ===========================================

  @Get(':id/join-requests')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async getJoinRequests(
    @Param('id') clubId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.clubsService.getJoinRequests(clubId, user.userId);
  }

  @Post(':id/join-requests/:requestId/approve')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async approveJoinRequest(
    @Param('id') clubId: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.clubsService.approveJoinRequest(clubId, requestId, user.userId);
  }

  @Post(':id/join-requests/:requestId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async rejectJoinRequest(
    @Param('id') clubId: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RejectJoinRequestDto
  ) {
    return this.clubsService.rejectJoinRequest(
      clubId,
      requestId,
      user.userId,
      dto.response
    );
  }

  // ===========================================
  // Fee Configuration Endpoints
  // ===========================================

  @Get(':id/fees')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async getClubFees(@Param('id') clubId: string, @CurrentUser() user: JwtUser) {
    return this.clubsService.getClubFees(clubId, user.userId);
  }

  @Get(':id/fees/:year/:month')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async getClubFeeForMonth(
    @Param('id') clubId: string,
    @Param('year') year: string,
    @Param('month') month: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.clubsService.getClubFeeForMonth(
      clubId,
      user.userId,
      parseInt(year, 10),
      parseInt(month, 10)
    );
  }

  @Post(':id/fees')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async upsertClubFee(
    @Param('id') clubId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateClubFeeDto
  ) {
    return this.clubsService.upsertClubFee(clubId, user.userId, dto);
  }

  @Delete(':id/fees/:feeId')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async deleteClubFee(
    @Param('feeId') feeId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.clubsService.deleteClubFee(feeId, user.userId);
  }

  // ===========================================
  // Helper Endpoints
  // ===========================================

  @Get('search-users')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async searchUsers(@CurrentUser() user: JwtUser, @Query('q') query: string) {
    return this.clubsService.searchUsersForClub(user.userId, query || '');
  }

  @Get('user/:userId/list')
  @UseGuards(JwtAuthGuard, RolesGuard, PlayerVipGuard)
  @Roles(Role.HOST, Role.ADMIN, Role.PLAYER)
  async getUserClubs(
    @Param('userId') userId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.clubsService.getUserClubsForHost(userId, user.userId);
  }

  // ===========================================
  // Admin Club Approval Endpoints
  // ===========================================

  @Get('admin/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getPendingClubs() {
    return this.clubsService.getPendingClubs();
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async approveClub(@Param('id') id: string) {
    return this.clubsService.approveClub(id);
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async rejectClub(@Param('id') id: string, @Body('reason') reason: string) {
    return this.clubsService.rejectClub(id, reason);
  }
}
