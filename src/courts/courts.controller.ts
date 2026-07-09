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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CourtsService } from './courts.service';
import { SelectPlayersDto } from './dto/select-players.dto';
import { PreSelectDto } from './dto/pre-select.dto';
import { UpdateCourtDto } from './dto/update-court.dto';
import { EndMatchDto } from './dto/end-match.dto';
import { SuggestedPlayersQueryDto } from './dto/suggested-players-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionAccessService } from '../common/session-access/session-access.service';

@ApiTags('courts')
@ApiBearerAuth('JWT-auth')
@Controller('courts')
@UseGuards(JwtAuthGuard)
export class CourtsController {
  constructor(
    private readonly courtsService: CourtsService,
    private readonly sessionAccess: SessionAccessService
  ) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.courtsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateCourtDto: UpdateCourtDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertCourtSessionHost(id, user.userId, user.role);
    return this.courtsService.update(id, updateCourtDto);
  }

  @Post(':id/select-players')
  async selectPlayers(
    @Param('id') id: string,
    @Body() selectPlayersDto: SelectPlayersDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertCourtSessionHost(id, user.userId, user.role);
    return this.courtsService.selectPlayers(id, selectPlayersDto);
  }

  @Post(':id/deselect-players')
  async deselectPlayers(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertCourtSessionHost(id, user.userId, user.role);
    return this.courtsService.deselectPlayers(id);
  }

  @Post(':id/start-match')
  async startMatch(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertCourtSessionHost(id, user.userId, user.role);
    return this.courtsService.startMatch(id);
  }

  @Post(':id/end-match')
  async endMatch(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string },
    @Body() endMatchDto?: EndMatchDto
  ) {
    await this.sessionAccess.assertCourtSessionHost(id, user.userId, user.role);
    return this.courtsService.endMatch(id, endMatchDto);
  }

  @Get(':id/current-match')
  getCurrentMatch(@Param('id') id: string) {
    return this.courtsService.getCurrentMatch(id);
  }

  @Post(':id/pre-select')
  async preSelect(
    @Param('id') id: string,
    @Body() preSelectDto: PreSelectDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertCourtSessionHost(id, user.userId, user.role);
    return this.courtsService.preSelect(id, preSelectDto);
  }

  @Delete(':id/pre-select')
  async cancelPreSelect(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    await this.sessionAccess.assertCourtSessionHost(id, user.userId, user.role);
    return this.courtsService.cancelPreSelect(id);
  }

  @Get(':id/pre-select')
  getPreSelect(@Param('id') id: string) {
    return this.courtsService.getPreSelect(id);
  }

  @Get(':id/suggested-players')
  async getSuggestedPlayers(
    @Param('id') id: string,
    @Query() query: SuggestedPlayersQueryDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    // Host-only tool; can trigger paid AI suggestions.
    await this.sessionAccess.assertCourtSessionHost(id, user.userId, user.role);
    const count = query.topCount ? parseInt(query.topCount, 10) : undefined;
    const enableAi = query.useAi === 'true';
    return this.courtsService.getSuggestedPlayers(
      id,
      count,
      enableAi,
      query.language,
      query.matchType
    );
  }
}
