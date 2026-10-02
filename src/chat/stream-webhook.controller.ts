import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import {
  ChatMessageNotifierService,
  StreamMessageNewEvent,
} from './chat-message-notifier.service';
import { StreamChatService } from './stream-chat.service';

@ApiTags('chat')
@Controller('chat/stream-webhook')
export class StreamWebhookController {
  constructor(
    private readonly stream: StreamChatService,
    private readonly notifier: ChatMessageNotifierService
  ) {}

  /**
   * Hit by Stream for every chat event. Authenticated by Stream's
   * `x-signature` HMAC rather than a JWT, hence `@Public()`.
   */
  @Public()
  @SkipThrottle()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') signature?: string
  ) {
    if (!req.rawBody || !this.stream.verifyWebhook(req.rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }
    await this.notifier.handleMessageNew(req.body as StreamMessageNewEvent);
    return { received: true };
  }
}
