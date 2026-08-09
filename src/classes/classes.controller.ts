import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { ClassesService } from './classes.service';
import { BrowseClassesDto } from './dto/browse-classes.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { UpdateClassStatusDto } from './dto/update-class-status.dto';

@ApiTags('classes')
@ApiBearerAuth('JWT-auth')
@Controller('classes')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  browse(
    @Query() query: BrowseClassesDto,
    @CurrentUser() user?: AuthenticatedUser
  ) {
    return this.classes.browse(query, user?.userId);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.classes.mine(user.userId, user.role);
  }

  @Public()
  @Get('sitemap')
  sitemap() {
    return this.classes.sitemap();
  }

  @Post()
  create(@Body() dto: CreateClassDto, @CurrentUser() user: AuthenticatedUser) {
    return this.classes.create(dto, user.userId);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':identifier')
  findOne(
    @Param('identifier') identifier: string,
    @CurrentUser() user?: AuthenticatedUser
  ) {
    return this.classes.findOne(identifier, user);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClassDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.classes.update(id, dto, user.userId, user.role);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateClassStatusDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.classes.updateStatus(id, dto.status, user.userId, user.role);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.classes.remove(id, user.userId, user.role);
  }
}
