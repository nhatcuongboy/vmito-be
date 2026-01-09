import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PwaService } from './pwa.service';
import { SubscribeDto, UnsubscribeDto, SyncDto } from './dto/pwa.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('pwa')
@Controller('pwa')
@UseGuards(JwtAuthGuard)
export class PwaController {
  constructor(private readonly pwaService: PwaService) {}

  @Public()
  @Post('subscribe')
  subscribe(@Body() subscribeDto: SubscribeDto) {
    if (!subscribeDto.subscription) {
      throw new BadRequestException('Subscription object is required');
    }
    return this.pwaService.subscribe(
      subscribeDto.subscription,
      subscribeDto.userId
    );
  }

  @Public()
  @Delete('subscribe')
  unsubscribe(@Body() unsubscribeDto: UnsubscribeDto) {
    if (!unsubscribeDto.endpoint) {
      throw new BadRequestException('Endpoint is required');
    }
    return this.pwaService.unsubscribe(
      unsubscribeDto.endpoint,
      unsubscribeDto.userId
    );
  }

  @Public()
  @Post('sync')
  sync(@Body() syncDto: SyncDto) {
    if (!syncDto.type) {
      throw new BadRequestException('Sync type is required');
    }
    return this.pwaService.sync(syncDto.type, syncDto.data);
  }

  @Public()
  @Get('sync')
  getPendingSync(
    @Query('userId') userId?: string,
    @Query('lastSync') lastSync?: string
  ) {
    return this.pwaService.getPendingSync(userId, lastSync);
  }
}
