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
import { CategoriesService } from './categories.service';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateCategoryRegistrationDto } from './dto/create-category-registration.dto';
import { BulkCreateRegistrationDto } from './dto/bulk-create-registration.dto';
import { ConvertLegacyRegistrationDto } from '../tournaments/dto/tournament-pair.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AssignGroupRegistrationDto } from './dto/assign-group-registration.dto';
import { BulkAssignGroupRegistrationDto } from './dto/bulk-assign-group-registration.dto';
import { AutoAssignDto } from './dto/auto-assign.dto';
import { CreateCategoryMatchDto } from './dto/create-category-match.dto';
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

  // ─── Category CRUD ────────────────────────────────────────

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
    return this.categoriesService.update(
      id,
      updateCategoryDto,
      user.userId,
      user.role
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.categoriesService.remove(id, user.userId, user.role);
  }

  // ─── Registrations ────────────────────────────────────────

  @Public()
  @Get(':id/registrations')
  getRegistrations(@Param('id') id: string) {
    return this.categoriesService.getRegistrations(id);
  }

  @Post(':id/registrations')
  createRegistration(
    @Param('id') id: string,
    @Body() dto: CreateCategoryRegistrationDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.createRegistration(
      id,
      dto,
      user.userId,
      user.role
    );
  }

  @Post(':id/registrations/bulk')
  bulkCreateRegistrations(
    @Param('id') id: string,
    @Body() dto: BulkCreateRegistrationDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.bulkCreateRegistrations(
      id,
      { names: dto.names, tournamentPlayerIds: dto.tournamentPlayerIds },
      user.userId,
      user.role
    );
  }

  @Public()
  @Get(':id/registrations/:registrationId')
  getRegistration(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string
  ) {
    return this.categoriesService.getRegistration(id, registrationId);
  }

  @Public()
  @Get(':id/registrations/:registrationId/matches')
  getRegistrationMatches(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string
  ) {
    return this.categoriesService.getRegistrationMatches(id, registrationId);
  }

  @Delete(':id/registrations/:registrationId')
  deleteRegistration(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.deleteRegistration(
      id,
      registrationId,
      user.userId,
      user.role
    );
  }

  @Put(':id/registrations/:registrationId/convert-to-pair')
  convertLegacyRegistrationToPair(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: ConvertLegacyRegistrationDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.convertLegacyRegistrationToPair(
      id,
      registrationId,
      dto,
      user.userId,
      user.role
    );
  }

  // ─── Groups ───────────────────────────────────────────────

  @Public()
  @Get(':id/groups')
  getGroups(@Param('id') id: string) {
    return this.categoriesService.getGroups(id);
  }

  @Post(':id/groups')
  createGroups(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.createGroups(id, user.userId, user.role);
  }

  @Post(':id/groups/generate-all-matches')
  generateAllGroupMatches(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.generateAllGroupMatches(
      id,
      user.userId,
      user.role
    );
  }

  @Put(':id/groups/:groupId')
  updateGroup(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.updateGroup(
      id,
      groupId,
      dto,
      user.userId,
      user.role
    );
  }

  @Delete(':id/groups/:groupId')
  deleteGroup(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.deleteGroup(
      id,
      groupId,
      user.userId,
      user.role
    );
  }

  // ─── Group Registration Assignment ────────────────────────

  @Post(':id/groups/:groupId/registrations')
  assignRegistrationToGroup(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @Body() dto: AssignGroupRegistrationDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.assignRegistrationToGroup(
      id,
      groupId,
      dto.categoryRegistrationId,
      user.userId,
      user.role
    );
  }

  @Post(':id/groups/:groupId/registrations/bulk')
  bulkAssignRegistrations(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @Body() dto: BulkAssignGroupRegistrationDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.bulkAssignRegistrations(
      id,
      groupId,
      dto.categoryRegistrationIds,
      user.userId,
      user.role
    );
  }

  @Post(':id/groups/auto-assign')
  autoAssignRegistrations(
    @Param('id') id: string,
    @Body() dto: AutoAssignDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.autoAssignRegistrations(
      id,
      { shuffle: dto.shuffle, strategy: dto.strategy },
      user.userId,
      user.role
    );
  }

  @Delete(':id/groups/:groupId/registrations/:registrationId')
  removeRegistrationFromGroup(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @Param('registrationId') registrationId: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.removeRegistrationFromGroup(
      id,
      groupId,
      registrationId,
      user.userId,
      user.role
    );
  }

  // ─── Group Matches ────────────────────────────────────────

  @Post(':id/groups/:groupId/generate-matches')
  generateGroupMatches(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.generateGroupMatches(
      id,
      groupId,
      user.userId,
      user.role
    );
  }

  @Public()
  @Get(':id/groups/:groupId/matches')
  getGroupMatches(@Param('id') id: string, @Param('groupId') groupId: string) {
    return this.categoriesService.getGroupMatches(id, groupId);
  }

  // ─── Category Matches ────────────────────────────────────

  @Public()
  @Get(':id/matches')
  getMatches(@Param('id') id: string) {
    return this.categoriesService.getMatches(id);
  }

  @Post(':id/matches')
  createMatch(
    @Param('id') id: string,
    @Body() dto: CreateCategoryMatchDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.createMatch(id, dto, user.userId, user.role);
  }

  @Public()
  @Get(':id/elimination-matches')
  getEliminationMatches(@Param('id') id: string) {
    return this.categoriesService.getEliminationMatches(id);
  }

  // ─── Standings ────────────────────────────────────────────

  @Public()
  @Get(':id/standings')
  getStandings(@Param('id') id: string) {
    return this.categoriesService.getStandings(id);
  }

  @Public()
  @Get(':id/groups/:groupId/standings')
  getGroupStandings(
    @Param('id') id: string,
    @Param('groupId') groupId: string
  ) {
    return this.categoriesService.getGroupStandings(id, groupId);
  }

  @Post(':id/groups/:groupId/calculate-standings')
  calculateStandings(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.calculateGroupStandings(
      id,
      groupId,
      user.userId,
      user.role
    );
  }

  @Public()
  @Get(':id/groups/:groupId/winners')
  getGroupWinners(@Param('id') id: string, @Param('groupId') groupId: string) {
    return this.categoriesService.getGroupWinners(id, groupId);
  }

  // ─── Group Stage Completion / Elimination Bracket ─────────

  @Get(':id/group-stage-completion')
  getGroupStageCompletion(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.getGroupStageCompletion(
      id,
      user.userId,
      user.role
    );
  }

  @Post(':id/complete-group-stage')
  completeGroupStage(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.categoriesService.completeGroupStage(
      id,
      user.userId,
      user.role
    );
  }
}
