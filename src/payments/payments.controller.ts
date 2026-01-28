import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { SubmitPaymentDto, ApprovePaymentDto, RejectPaymentDto, BulkApproveDto } from './dto';
import { PaymentStatus } from '@prisma/client';

@ApiTags('payments')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  // Session payments (host view)
  @Get('sessions/:sessionId/payments')
  @ApiOperation({ summary: 'Get all payments for a session (host view)' })
  @ApiQuery({ name: 'status', enum: PaymentStatus, required: false })
  @ApiResponse({ status: 200, description: 'Payment list with stats' })
  async findBySession(
    @Param('sessionId') sessionId: string,
    @Query('status') status: PaymentStatus,
    @CurrentUser() user: { userId: string },
  ) {
    return this.service.findBySession(sessionId, user.userId, status);
  }

  // Player's payments for a session
  @Get('sessions/:sessionId/my-payments')
  @ApiOperation({ summary: 'Get my payments for a session' })
  @ApiResponse({ status: 200, description: 'My payment records' })
  async findMyPayments(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.service.findMyPayments(sessionId, user.userId);
  }

  // Submit payment
  @Post('payments/:id/submit')
  @ApiOperation({ summary: 'Submit payment (mark as paid)' })
  @ApiResponse({ status: 200, description: 'Payment submitted' })
  @ApiResponse({ status: 400, description: 'Invalid status' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  async submit(
    @Param('id') id: string,
    @Body() dto: SubmitPaymentDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.service.submit(id, dto, user.userId);
  }

  // Approve payment
  @Post('payments/:id/approve')
  @ApiOperation({ summary: 'Approve payment (host)' })
  @ApiResponse({ status: 200, description: 'Payment approved' })
  @ApiResponse({ status: 400, description: 'Invalid status' })
  @ApiResponse({ status: 403, description: 'Not session host' })
  async approve(
    @Param('id') id: string,
    @Body() dto: ApprovePaymentDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.service.approve(id, dto, user.userId);
  }

  // Reject payment
  @Post('payments/:id/reject')
  @ApiOperation({ summary: 'Reject payment (host)' })
  @ApiResponse({ status: 200, description: 'Payment rejected' })
  @ApiResponse({ status: 400, description: 'Invalid status' })
  @ApiResponse({ status: 403, description: 'Not session host' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectPaymentDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.service.reject(id, dto, user.userId);
  }

  // Bulk approve
  @Post('payments/bulk-approve')
  @ApiOperation({ summary: 'Bulk approve payments (host)' })
  @ApiResponse({ status: 200, description: 'Bulk approval result' })
  async bulkApprove(
    @Body() dto: BulkApproveDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.service.bulkApprove(dto, user.userId);
  }

  // Transaction summary for player
  @Get('payments/me/summary')
  @ApiOperation({ summary: 'Get transaction summary for current player (grouped by host)' })
  @ApiResponse({ status: 200, description: 'Transaction summary' })
  async getPlayerTransactionSummary(@CurrentUser() user: { userId: string }) {
    return this.service.getPlayerTransactionSummary(user.userId);
  }

  // Transaction summary for host
  @Get('payments/host/summary')
  @ApiOperation({ summary: 'Get transaction summary for current host (grouped by user)' })
  @ApiResponse({ status: 200, description: 'Transaction summary' })
  async getHostTransactionSummary(@CurrentUser() user: { userId: string }) {
    return this.service.getHostTransactionSummary(user.userId);
  }

  // Detailed transactions with a specific host (player view)
  @Get('payments/me/host/:hostId')
  @ApiOperation({ summary: 'Get detailed transactions between player and specific host' })
  @ApiResponse({ status: 200, description: 'Detailed transactions with host' })
  async getPlayerTransactionsWithHost(
    @Param('hostId') hostId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.service.getPlayerTransactionsWithHost(user.userId, hostId);
  }

  // Detailed transactions with a specific user (host view)
  @Get('payments/host/user/:userId')
  @ApiOperation({ summary: 'Get detailed transactions between host and specific user' })
  @ApiResponse({ status: 200, description: 'Detailed transactions with user' })
  async getHostTransactionsWithUser(
    @Param('userId') targetUserId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.service.getHostTransactionsWithUser(user.userId, targetUserId);
  }

  // Set split amount for SPLIT_EVENLY fee type
  @Post('sessions/:sessionId/payments/split')
  @ApiOperation({ summary: 'Set split amount for session (SPLIT_EVENLY fee type)' })
  @ApiResponse({ status: 200, description: 'Split amount set and payments updated' })
  @ApiResponse({ status: 400, description: 'Invalid fee type or no players' })
  @ApiResponse({ status: 403, description: 'Not session host' })
  async setSplitAmount(
    @Param('sessionId') sessionId: string,
    @Body() body: { totalAmount: number },
    @CurrentUser() user: { userId: string },
  ) {
    return this.service.setSplitAmount(sessionId, body.totalAmount, user.userId);
  }

  // Get payment statistics for a session
  @Get('sessions/:sessionId/payments/stats')
  @ApiOperation({ summary: 'Get payment statistics for a session (host)' })
  @ApiResponse({ status: 200, description: 'Payment statistics' })
  @ApiResponse({ status: 403, description: 'Not session host' })
  async getSessionStats(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.service.getSessionStats(sessionId, user.userId);
  }
}
