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
import { PaymentSettingsService } from './payment-settings.service';
import { CreatePaymentSettingsDto, UpdatePaymentSettingsDto } from './dto';

@ApiTags('payment-settings')
@ApiBearerAuth('JWT-auth')
@Controller('payment-settings')
@UseGuards(JwtAuthGuard)
export class PaymentSettingsController {
  constructor(private readonly service: PaymentSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all payment settings for current user' })
  @ApiResponse({ status: 200, description: 'Payment settings list' })
  async findAll(@CurrentUser() user: { userId: string }) {
    return this.service.findAll(user.userId);
  }

  @Get('default')
  @ApiOperation({ summary: 'Get default payment settings for current user' })
  @ApiResponse({ status: 200, description: 'Default payment settings' })
  async findDefault(@CurrentUser() user: { userId: string }) {
    return this.service.findDefault(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment settings by ID' })
  @ApiResponse({ status: 200, description: 'Payment settings found' })
  @ApiResponse({ status: 404, description: 'Payment settings not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string }
  ) {
    return this.service.findOne(id, user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create payment settings' })
  @ApiResponse({ status: 201, description: 'Payment settings created' })
  async create(
    @Body() dto: CreatePaymentSettingsDto,
    @CurrentUser() user: { userId: string }
  ) {
    return this.service.create(dto, user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update payment settings' })
  @ApiResponse({ status: 200, description: 'Payment settings updated' })
  @ApiResponse({ status: 404, description: 'Payment settings not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentSettingsDto,
    @CurrentUser() user: { userId: string }
  ) {
    return this.service.update(id, dto, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete payment settings' })
  @ApiResponse({ status: 200, description: 'Payment settings deleted' })
  @ApiResponse({ status: 404, description: 'Payment settings not found' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string }
  ) {
    return this.service.delete(id, user.userId);
  }

  @Post(':id/set-default')
  @ApiOperation({ summary: 'Set payment settings as default' })
  @ApiResponse({ status: 200, description: 'Default updated' })
  @ApiResponse({ status: 404, description: 'Payment settings not found' })
  async setDefault(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string }
  ) {
    return this.service.setDefault(id, user.userId);
  }
}

// Separate controller for public host payment settings access
@ApiTags('payment-settings')
@ApiBearerAuth('JWT-auth')
@Controller('hosts/:hostId/payment-settings')
@UseGuards(JwtAuthGuard)
export class HostPaymentSettingsController {
  constructor(private readonly service: PaymentSettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get default payment settings for a host (for players)',
  })
  @ApiResponse({ status: 200, description: 'Host payment settings' })
  async findHostDefault(@Param('hostId') hostId: string) {
    return this.service.findDefaultByHost(hostId);
  }
}
