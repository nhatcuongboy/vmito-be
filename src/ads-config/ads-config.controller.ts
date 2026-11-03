import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdsConfigService } from './ads-config.service';

@ApiTags('ads-config')
@Controller('ads-config')
@UseGuards(JwtAuthGuard)
export class AdsConfigController {
  constructor(private readonly adsConfigService: AdsConfigService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Whether mobile clients show ads, and on which screens',
  })
  get() {
    return this.adsConfigService.get();
  }
}
