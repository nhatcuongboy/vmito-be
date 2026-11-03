import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AppUpdatePolicyService } from './app-update-policy.service';
import { GetAppUpdatePolicyDto } from './dto/get-app-update-policy.dto';

@ApiTags('app-update-policy')
@Controller('app-update-policy')
@UseGuards(JwtAuthGuard)
export class AppUpdatePolicyController {
  constructor(private readonly policyService: AppUpdatePolicyService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary:
      'Whether mobile clients older than minVersion must update (per platform)',
  })
  get(@Query() query: GetAppUpdatePolicyDto) {
    return this.policyService.getForPlatform(query.platform);
  }
}
