import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FixedMembersService } from './fixed-members.service';
import {
  CreateGroupDto,
  UpdateGroupDto,
  CreateGroupFeeDto,
  UpdateMemberRoleDto,
  RejectJoinRequestDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface JwtUser {
  userId: string;
  email: string;
  role: Role;
}

@Controller('fixed-member-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.HOST, Role.ADMIN)
export class FixedMembersController {
  constructor(private readonly fixedMembersService: FixedMembersService) {}

  // ===========================================
  // Group Endpoints
  // ===========================================

  @Get()
  async getGroups(@CurrentUser() user: JwtUser) {
    return this.fixedMembersService.getGroups(user.userId);
  }

  @Get('search-users')
  async searchUsers(@CurrentUser() user: JwtUser, @Query('q') query: string) {
    return this.fixedMembersService.searchUsersForGroup(
      user.userId,
      query || ''
    );
  }

  @Get(':groupId')
  async getGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.fixedMembersService.getGroup(groupId, user.userId);
  }

  @Post()
  @Roles(Role.ADMIN)
  async createGroup(@CurrentUser() user: JwtUser, @Body() dto: CreateGroupDto) {
    return this.fixedMembersService.createGroup(user.userId, dto);
  }

  @Put(':groupId')
  async updateGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateGroupDto
  ) {
    return this.fixedMembersService.updateGroup(groupId, user.userId, dto);
  }

  @Delete(':groupId')
  async deleteGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.fixedMembersService.deleteGroup(groupId, user.userId);
  }

  // ===========================================
  // Member Endpoints
  // ===========================================

  @Get(':groupId/members')
  async getGroupMembers(
    @Param('groupId') groupId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.fixedMembersService.getGroupMembers(groupId, user.userId);
  }

  @Post(':groupId/members/:userId')
  async addMemberToGroup(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.fixedMembersService.addMemberToGroup(
      groupId,
      userId,
      user.userId
    );
  }

  @Delete(':groupId/members/:userId')
  async removeMemberFromGroup(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.fixedMembersService.removeMemberFromGroup(
      groupId,
      userId,
      user.userId
    );
  }

  @Put(':groupId/members/:userId/role')
  async updateMemberRole(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateMemberRoleDto
  ) {
    return this.fixedMembersService.updateMemberRole(
      groupId,
      userId,
      user.userId,
      dto.role
    );
  }

  // ===========================================
  // Join Request Endpoints
  // ===========================================

  @Get(':groupId/join-requests')
  async getJoinRequests(
    @Param('groupId') groupId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.fixedMembersService.getJoinRequests(groupId, user.userId);
  }

  @Post(':groupId/join-requests/:requestId/approve')
  async approveJoinRequest(
    @Param('groupId') groupId: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.fixedMembersService.approveJoinRequest(
      groupId,
      requestId,
      user.userId
    );
  }

  @Post(':groupId/join-requests/:requestId/reject')
  async rejectJoinRequest(
    @Param('groupId') groupId: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RejectJoinRequestDto
  ) {
    return this.fixedMembersService.rejectJoinRequest(
      groupId,
      requestId,
      user.userId,
      dto.response
    );
  }

  // ===========================================
  // Fee Configuration Endpoints
  // ===========================================

  @Get(':groupId/fees')
  async getGroupFees(
    @Param('groupId') groupId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.fixedMembersService.getGroupFees(groupId, user.userId);
  }

  @Get(':groupId/fees/:year/:month')
  async getGroupFeeForMonth(
    @Param('groupId') groupId: string,
    @Param('year') year: string,
    @Param('month') month: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.fixedMembersService.getGroupFeeForMonth(
      groupId,
      user.userId,
      parseInt(year, 10),
      parseInt(month, 10)
    );
  }

  @Post(':groupId/fees')
  async upsertGroupFee(
    @Param('groupId') groupId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateGroupFeeDto
  ) {
    return this.fixedMembersService.upsertGroupFee(groupId, user.userId, dto);
  }

  @Delete(':groupId/fees/:feeId')
  async deleteGroupFee(
    @Param('feeId') feeId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.fixedMembersService.deleteGroupFee(feeId, user.userId);
  }

  // ===========================================
  // Helper Endpoints
  // ===========================================

  @Get('user/:userId/groups')
  async getUserGroups(
    @Param('userId') userId: string,
    @CurrentUser() user: JwtUser
  ) {
    return this.fixedMembersService.getUserGroupsForHost(userId, user.userId);
  }
}
