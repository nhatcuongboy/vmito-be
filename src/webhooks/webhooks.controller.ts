import {
  Body,
  Controller,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { WebhooksService } from './webhooks.service';
import type { ApifyWebhookPayload } from './dto/apify-webhook.dto';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Public endpoint hit by the Apify actor after each Facebook crawl.
   * Authenticated by a shared secret (header `x-apify-secret` or `?secret=`),
   * NOT by JWT — hence @Public() to bypass the global JwtAuthGuard.
   *
   * Multi-account rotation: each Actor's webhook URL must include
   * `?account=<accountId>` so the service can resolve the correct API token
   * for fetching the dataset. If omitted, falls back to APIFY_TOKEN.
   */
  @Public()
  @Post('apify')
  @ApiExcludeEndpoint()
  async handleApify(
    @Body() payload: ApifyWebhookPayload,
    @Headers('x-apify-secret') headerSecret?: string,
    @Query('secret') querySecret?: string,
    @Query('account') accountId?: string
  ) {
    const expected = this.configService.get<string>('apify.webhookSecret');
    if (!expected) {
      throw new UnauthorizedException('Webhook secret is not configured.');
    }
    const provided = headerSecret || querySecret;
    if (provided !== expected) {
      throw new UnauthorizedException('Invalid webhook secret.');
    }

    return this.webhooksService.ingestApifyPosts(payload, accountId);
  }
}
