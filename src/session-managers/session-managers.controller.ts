import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { SessionAccessService } from '../common/session-access/session-access.service';
import { SessionManagersService } from './session-managers.service';
import { CreateSessionManagerDto } from './dto/create-session-manager.dto';
import { CreateSessionManagerInviteDto } from './dto/create-session-manager-invite.dto';
import { JoinSessionManagerDto } from './dto/join-session-manager.dto';
import { UpdateSessionManagerDto } from './dto/update-session-manager.dto';

@ApiTags('session-managers')
@ApiBearerAuth('JWT-auth')
@Controller('sessions/:sessionId')
@UseGuards(JwtAuthGuard)
export class SessionManagersController {
  constructor(
    private readonly managers: SessionManagersService,
    private readonly access: SessionAccessService
  ) {}

  @Get('my-access')
  @ApiOperation({ summary: "The caller's management rights on this session" })
  myAccess(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.access.getMyAccess(sessionId, user.userId, user.role);
  }

  @Get('managers')
  list(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.managers.list(sessionId, user.userId, user.role);
  }

  @Post('managers')
  add(
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateSessionManagerDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.managers.add(sessionId, dto, user.userId, user.role);
  }

  // Literal paths stay above ':userId'.
  @Post('managers/invites')
  @ApiOperation({ summary: 'Issue a one-time QR invite (10 minutes)' })
  createInvite(
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateSessionManagerInviteDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.managers.createInvite(sessionId, dto, user.userId, user.role);
  }

  @Delete('managers/invites')
  revokeInvites(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.managers.revokeInvites(sessionId, user.userId, user.role);
  }

  @Post('managers/join')
  @ApiOperation({ summary: 'Become a co-host by redeeming a QR invite' })
  join(
    @Param('sessionId') sessionId: string,
    @Body() dto: JoinSessionManagerDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.managers.join(sessionId, dto.code, user.userId);
  }

  @Patch('managers/:userId')
  updatePermissions(
    @Param('sessionId') sessionId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateSessionManagerDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.managers.updatePermissions(
      sessionId,
      targetUserId,
      dto,
      user.userId,
      user.role
    );
  }

  @Delete('managers/:userId')
  remove(
    @Param('sessionId') sessionId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.managers.remove(
      sessionId,
      targetUserId,
      user.userId,
      user.role
    );
  }
}
