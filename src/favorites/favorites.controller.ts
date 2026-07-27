import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseEnumPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FavoriteType } from '@prisma/client';
import { FavoritesService } from './favorites.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { ListFavoritesDto } from './dto/list-favorites.dto';
import { FavoriteUsersQueryDto } from './dto/favorite-users-query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('favorites')
@ApiBearerAuth('JWT-auth')
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFavoriteDto
  ) {
    return this.favoritesService.create(user.userId, dto);
  }

  @Delete(':type/:targetId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type', new ParseEnumPipe(FavoriteType)) type: FavoriteType,
    @Param('targetId') targetId: string
  ) {
    return this.favoritesService.remove(user.userId, type, targetId);
  }

  @Get()
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListFavoritesDto
  ) {
    return this.favoritesService.findUserFavorites(
      user.userId,
      query.type,
      query.page ?? 1,
      query.limit ?? 10
    );
  }

  @Get(':type/:targetId/summary')
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type', new ParseEnumPipe(FavoriteType)) type: FavoriteType,
    @Param('targetId') targetId: string
  ) {
    return this.favoritesService.getSummary(
      user.userId,
      user.role,
      type,
      targetId
    );
  }

  @Get(':type/:targetId/users')
  getFavoriteUsers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type', new ParseEnumPipe(FavoriteType)) type: FavoriteType,
    @Param('targetId') targetId: string,
    @Query() query: FavoriteUsersQueryDto
  ) {
    return this.favoritesService.getFavoriteUsers(
      user.userId,
      user.role,
      type,
      targetId,
      query.page ?? 1,
      query.limit ?? 20
    );
  }
}
