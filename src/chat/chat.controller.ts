import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import {
  AcceptChatTermsDto,
  ChatBlockDto,
  ChatContactsQueryDto,
  CreateChatRequestDto,
  DirectChatDto,
} from './dto/chat.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('session')
  session(@CurrentUser() user: { userId: string }) {
    return this.chat.getSession(user.userId);
  }

  @Post('consent')
  @HttpCode(HttpStatus.OK)
  consent(
    @CurrentUser() user: { userId: string },
    @Body() dto: AcceptChatTermsDto
  ) {
    return this.chat.acceptTerms(user.userId, dto.termsVersion);
  }

  @Get('contacts')
  contacts(
    @CurrentUser() user: { userId: string },
    @Query() query: ChatContactsQueryDto
  ) {
    return this.chat.findContacts(user.userId, query);
  }

  @Get('requests')
  requests(@CurrentUser() user: { userId: string }) {
    return this.chat.getRequests(user.userId);
  }

  @Post('requests')
  @Throttle({ default: { limit: 5, ttl: 86400000 } })
  request(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateChatRequestDto
  ) {
    return this.chat.createRequest(user.userId, dto);
  }

  @Post('requests/:id/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.chat.acceptRequest(user.userId, id);
  }

  @Post('requests/:id/decline')
  @HttpCode(HttpStatus.OK)
  decline(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.chat.declineRequest(user.userId, id);
  }

  @Post('requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.chat.cancelRequest(user.userId, id);
  }

  @Post('direct')
  @HttpCode(HttpStatus.OK)
  direct(@CurrentUser() user: { userId: string }, @Body() dto: DirectChatDto) {
    return this.chat.direct(user.userId, dto.targetUserId);
  }

  @Post('blocks')
  @HttpCode(HttpStatus.OK)
  block(@CurrentUser() user: { userId: string }, @Body() dto: ChatBlockDto) {
    return this.chat.block(user.userId, dto.targetUserId);
  }

  @Delete('blocks/:targetUserId')
  @HttpCode(HttpStatus.OK)
  unblock(
    @CurrentUser() user: { userId: string },
    @Param('targetUserId') targetUserId: string
  ) {
    return this.chat.unblock(user.userId, targetUserId);
  }
}
