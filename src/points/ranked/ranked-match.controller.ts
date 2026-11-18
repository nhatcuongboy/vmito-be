import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RankedMatchService } from './ranked-match.service';
import { RankedMatchesQueryService } from './ranked-matches-query.service';
import { DisputeResultDto, MyRankedMatchesQueryDto } from './dto/ranked.dto';

type AuthUser = { userId: string; role: string };

@ApiTags('ranked')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(JwtAuthGuard)
export class RankedMatchController {
  constructor(
    private readonly rankedMatches: RankedMatchService,
    private readonly query: RankedMatchesQueryService
  ) {}

  @Post('matches/:id/ranked-dispute')
  @ApiOperation({
    summary: 'Dispute a casual match result (wrong result / did not play)',
  })
  dispute(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: DisputeResultDto
  ) {
    return this.rankedMatches.dispute(user.userId, id, dto);
  }

  @Get('me/ranked-matches')
  @ApiOperation({ summary: 'My matches on the verified ranking, by session' })
  listMine(
    @CurrentUser() user: AuthUser,
    @Query() query: MyRankedMatchesQueryDto
  ) {
    return this.query.listMine(user.userId, query);
  }
}
