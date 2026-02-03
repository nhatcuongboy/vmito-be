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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FeeService } from './fee.service';
import { CreateFeeConfigDto, UpdateFeeConfigDto } from './dto';

@ApiTags('fee')
@ApiBearerAuth('JWT-auth')
@Controller('sessions/:sessionId/fee-config')
@UseGuards(JwtAuthGuard)
export class FeeController {
  constructor(private readonly feeService: FeeService) {}

  @Get()
  @ApiOperation({ summary: 'Get fee config for a session' })
  @ApiResponse({ status: 200, description: 'Fee config found' })
  @ApiResponse({ status: 404, description: 'Fee config not found' })
  async findOne(@Param('sessionId') sessionId: string) {
    return this.feeService.findBySessionId(sessionId);
  }

  @Post()
  @ApiOperation({ summary: 'Create fee config for a session' })
  @ApiResponse({ status: 201, description: 'Fee config created' })
  @ApiResponse({ status: 403, description: 'Not session host' })
  @ApiResponse({ status: 409, description: 'Fee config already exists' })
  async create(
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateFeeConfigDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.feeService.create(sessionId, dto, user.userId, user.role);
  }

  @Put()
  @ApiOperation({ summary: 'Update fee config for a session' })
  @ApiResponse({ status: 200, description: 'Fee config updated' })
  @ApiResponse({ status: 403, description: 'Not session host' })
  @ApiResponse({ status: 404, description: 'Fee config not found' })
  async update(
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateFeeConfigDto,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.feeService.update(sessionId, dto, user.userId, user.role);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete fee config for a session' })
  @ApiResponse({ status: 200, description: 'Fee config deleted' })
  @ApiResponse({ status: 403, description: 'Not session host' })
  @ApiResponse({ status: 404, description: 'Fee config not found' })
  async delete(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.feeService.delete(sessionId, user.userId, user.role);
  }
}
