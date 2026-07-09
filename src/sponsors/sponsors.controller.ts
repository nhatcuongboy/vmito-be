import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SponsorsService } from './sponsors.service';
import { CreateSponsorDto } from './dto/create-sponsor.dto';
import { UpdateSponsorDto } from './dto/update-sponsor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

interface CurrentUserPayload {
  userId: string;
  role: string;
}

@ApiTags('sponsors')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(JwtAuthGuard)
export class SponsorsController {
  constructor(private readonly sponsorsService: SponsorsService) {}

  @Public()
  @Get('tournaments/:tournamentId/sponsors')
  findByTournament(@Param('tournamentId') tournamentId: string) {
    return this.sponsorsService.findByTournament(tournamentId);
  }

  @Post('tournaments/:tournamentId/sponsors')
  create(
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateSponsorDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.sponsorsService.create(
      tournamentId,
      dto,
      user.userId,
      user.role
    );
  }

  @Public()
  @Get('sponsors/:id')
  findOne(@Param('id') id: string) {
    return this.sponsorsService.findOne(id);
  }

  @Put('sponsors/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSponsorDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.sponsorsService.update(id, dto, user.userId, user.role);
  }

  @Delete('sponsors/:id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.sponsorsService.remove(id, user.userId, user.role);
  }
}
