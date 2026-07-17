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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TournamentsService } from './tournaments.service';
import { TournamentMatchGenerationService } from './services/tournament-match-generation.service';
import { CategoriesService } from '../categories/categories.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { DuplicateTournamentDto } from './dto/duplicate-tournament.dto';
import { BrowseTournamentsDto } from './dto/browse-tournaments.dto';
import { CreateCategoryDto } from '../categories/dto/create-category.dto';
import {
  CreateTournamentPlayerDto,
  BulkTournamentPlayersDto,
} from './dto/create-tournament-player.dto';
import { AddTournamentVenueDto } from './dto/add-tournament-venue.dto';
import { ScoreboardQueryDto } from './dto/scoreboard-query.dto';
import { SaveTournamentPairDto } from './dto/tournament-pair.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('tournaments')
@ApiBearerAuth('JWT-auth')
@Controller('tournaments')
@UseGuards(JwtAuthGuard)
export class TournamentsController {
  constructor(
    private readonly tournamentsService: TournamentsService,
    private readonly tournamentMatchGenerationService: TournamentMatchGenerationService,
    private readonly categoriesService: CategoriesService
  ) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(
    @Query() query: BrowseTournamentsDto,
    @CurrentUser() user?: AuthenticatedUser
  ) {
    return this.tournamentsService.findAll(query, user?.userId);
  }

  @Get('my')
  findMy(@CurrentUser() user: { userId: string }) {
    return this.tournamentsService.findMyTournaments(user.userId);
  }

  @Get(':id/my-access')
  getMyAccess(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.tournamentsService.getMyAccess(id, user.userId, user.role);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tournamentsService.findOne(id);
  }

  @Post()
  create(
    @Body() createTournamentDto: CreateTournamentDto,
    @CurrentUser() user: { userId: string }
  ) {
    return this.tournamentsService.create(createTournamentDto, user.userId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateTournamentDto: UpdateTournamentDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.tournamentsService.update(
      id,
      updateTournamentDto,
      user.userId,
      user.role
    );
  }

  @Post(':id/duplicate')
  duplicate(
    @Param('id') id: string,
    @Body() duplicateTournamentDto: DuplicateTournamentDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.tournamentsService.duplicateTournament(
      id,
      duplicateTournamentDto,
      user.userId,
      user.role
    );
  }

  @Delete(':id/matches')
  deleteAllMatches(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string }
  ) {
    return this.tournamentMatchGenerationService.deleteAllTournamentMatches(
      id,
      user.userId
    );
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.tournamentsService.remove(id, user.userId, user.role);
  }

  @Public()
  @Get(':id/categories')
  getCategories(@Param('id') id: string) {
    return this.categoriesService.findByTournament(id);
  }

  @Public()
  @Get(':id/all-matches')
  getAllMatches(@Param('id') id: string) {
    return this.tournamentsService.getAllMatches(id);
  }

  @Public()
  @Get(':id/progress')
  getProgress(@Param('id') id: string) {
    return this.tournamentsService.getProgress(id);
  }

  @Public()
  @Get(':id/scoreboard')
  getScoreboard(@Param('id') id: string, @Query() query: ScoreboardQueryDto) {
    return this.tournamentsService.getScoreboard(id, query);
  }

  @Public()
  @Get(':id/courts')
  getCourts(@Param('id') id: string) {
    return this.tournamentsService.getCourts(id);
  }

  @Post(':id/categories')
  createCategory(
    @Param('id') id: string,
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.categoriesService.createCategory(
      id,
      dto,
      user.userId,
      user.role
    );
  }

  @Public()
  @Get(':id/players')
  getPlayers(@Param('id') id: string) {
    return this.tournamentsService.getPlayers(id);
  }

  @Post(':id/players')
  createPlayer(
    @Param('id') id: string,
    @Body() dto: CreateTournamentPlayerDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.tournamentsService.createPlayer(
      id,
      dto,
      user.userId,
      user.role
    );
  }

  @Post(':id/players/bulk-preview')
  previewBulkPlayers(
    @Param('id') id: string,
    @Body() dto: BulkTournamentPlayersDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.tournamentsService.previewBulkPlayers(
      id,
      dto,
      user.userId,
      user.role
    );
  }

  @Post(':id/players/bulk-create')
  createBulkPlayers(
    @Param('id') id: string,
    @Body() dto: BulkTournamentPlayersDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.tournamentsService.createBulkPlayers(
      id,
      dto,
      user.userId,
      user.role
    );
  }

  @Public()
  @Get(':id/pairs')
  getPairs(@Param('id') id: string) {
    return this.tournamentsService.getPairs(id);
  }

  @Post(':id/pairs')
  createPair(
    @Param('id') id: string,
    @Body() dto: SaveTournamentPairDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.tournamentsService.createPair(id, dto, user.userId, user.role);
  }

  // --- Tournament Venues ---
  @Public()
  @Get(':id/venues')
  getVenues(@Param('id') id: string) {
    return this.tournamentsService.getVenues(id);
  }

  @Post(':id/venues')
  addVenue(@Param('id') id: string, @Body() dto: AddTournamentVenueDto) {
    return this.tournamentsService.addVenue(id, dto);
  }

  @Delete(':id/venues/:venueId')
  removeVenue(@Param('id') id: string, @Param('venueId') venueId: string) {
    return this.tournamentsService.removeVenue(id, venueId);
  }
}
