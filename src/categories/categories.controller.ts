import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

interface CurrentUserPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  image: string | null;
}

@ApiTags('categories')
@ApiBearerAuth('JWT-auth')
@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.update(id, updateCategoryDto, user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.categoriesService.remove(id, user.userId);
  }

  @Public()
  @Get(':id/registrations')
  getRegistrations(@Param('id') id: string) {
    return this.categoriesService.getRegistrations(id);
  }

  @Public()
  @Get(':id/groups')
  getGroups(@Param('id') id: string) {
    return this.categoriesService.getGroups(id);
  }

  @Public()
  @Get(':id/matches')
  getMatches(@Param('id') id: string) {
    return this.categoriesService.getMatches(id);
  }

  @Public()
  @Get(':id/standings')
  getStandings(@Param('id') id: string) {
    return this.categoriesService.getStandings(id);
  }
}
