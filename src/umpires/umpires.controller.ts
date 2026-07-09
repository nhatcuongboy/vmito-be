import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UmpiresService } from './umpires.service';
import { CreateUmpireDto } from './dto/create-umpire.dto';
import { UpdateUmpireDto } from './dto/update-umpire.dto';
import { LinkUmpireAccountDto } from './dto/link-umpire-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('umpires')
@ApiBearerAuth('JWT-auth')
@Controller('tournaments/:tournamentId/umpires')
@UseGuards(JwtAuthGuard)
export class TournamentUmpiresController {
  constructor(private readonly umpiresService: UmpiresService) {}

  @Get()
  list(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.umpiresService.list(tournamentId, user.userId, user.role);
  }

  @Post()
  create(
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateUmpireDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.umpiresService.create(
      tournamentId,
      dto,
      user.userId,
      user.role
    );
  }
}

@ApiTags('umpires')
@ApiBearerAuth('JWT-auth')
@Controller('tournament-umpires')
@UseGuards(JwtAuthGuard)
export class UmpiresController {
  constructor(private readonly umpiresService: UmpiresService) {}

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUmpireDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.umpiresService.update(id, dto, user.userId, user.role);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.umpiresService.remove(id, user.userId, user.role);
  }

  @Patch(':id/link-account')
  linkAccount(
    @Param('id') id: string,
    @Body() dto: LinkUmpireAccountDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.umpiresService.linkAccount(id, dto, user.userId, user.role);
  }

  @Delete(':id/link-account')
  unlinkAccount(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.umpiresService.unlinkAccount(id, user.userId, user.role);
  }
}
