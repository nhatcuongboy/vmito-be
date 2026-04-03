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
import { TournamentsService } from './tournaments.service';
import { CategoriesService } from '../categories/categories.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { CreateCategoryDto } from '../categories/dto/create-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('tournaments')
@ApiBearerAuth('JWT-auth')
@Controller('tournaments')
@UseGuards(JwtAuthGuard)
export class TournamentsController {
  constructor(
    private readonly tournamentsService: TournamentsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  @Public()
  @Get()
  findAll() {
    return this.tournamentsService.findAll();
  }

  @Get('my')
  findMy(@CurrentUser() user: { userId: string }) {
    return this.tournamentsService.findMyTournaments(user.userId);
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

  @Post(':id/categories')
  createCategory(
    @Param('id') id: string,
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.categoriesService.createCategory(id, dto, user.userId, user.role);
  }

  @Public()
  @Get(':id/players')
  getPlayers(@Param('id') id: string) {
    return this.tournamentsService.getPlayers(id);
  }

  @Post(':id/players')
  createPlayer(
    @Param('id') id: string,
    @Body() dto: any, // or specific DTO
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.tournamentsService.createPlayer(id, dto, user.userId, user.role);
  }
}
