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

@ApiTags('courts')
@ApiBearerAuth('JWT-auth')
@Controller('courts')
@UseGuards(JwtAuthGuard)
export class CourtsController {
  constructor(private readonly courtsService: CourtsService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.courtsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCourtDto: UpdateCourtDto) {
    return this.courtsService.update(id, updateCourtDto);
  }

  @Post(':id/select-players')
  selectPlayers(
    @Param('id') id: string,
    @Body() selectPlayersDto: SelectPlayersDto
  ) {
    return this.courtsService.selectPlayers(id, selectPlayersDto);
  }

  @Post(':id/deselect-players')
  deselectPlayers(@Param('id') id: string) {
    return this.courtsService.deselectPlayers(id);
  }

  @Post(':id/start-match')
  startMatch(@Param('id') id: string) {
    return this.courtsService.startMatch(id);
  }

  @Post(':id/end-match')
  endMatch(@Param('id') id: string, @Body() endMatchDto?: EndMatchDto) {
    return this.courtsService.endMatch(id, endMatchDto);
  }

  @Get(':id/current-match')
  getCurrentMatch(@Param('id') id: string) {
    return this.courtsService.getCurrentMatch(id);
  }

  @Post(':id/pre-select')
  preSelect(@Param('id') id: string, @Body() preSelectDto: PreSelectDto) {
    return this.courtsService.preSelect(id, preSelectDto);
  }

  @Delete(':id/pre-select')
  cancelPreSelect(@Param('id') id: string) {
    return this.courtsService.cancelPreSelect(id);
  }

  @Get(':id/pre-select')
  getPreSelect(@Param('id') id: string) {
    return this.courtsService.getPreSelect(id);
  }

  @Get(':id/suggested-players')
  getSuggestedPlayers(
    @Param('id') id: string,
    @Query() query: SuggestedPlayersQueryDto
  ) {
    const count = query.topCount ? parseInt(query.topCount, 10) : undefined;
    const enableAi = query.useAi === 'true';
    return this.courtsService.getSuggestedPlayers(id, count, enableAi, query.language);
  }
}
