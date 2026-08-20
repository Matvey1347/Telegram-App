import { Controller, Headers, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { StripeWebhookService } from './stripe-webhook.service';

@Controller('billing/webhooks/stripe')
export class StripeWebhookController {
  constructor(private readonly webhooks: StripeWebhookService) {}
  @Post(':configId') receive(@Param('configId') configId: string, @Headers('stripe-signature') signature: string | undefined, @Req() request: RawBodyRequest<Request>) {
    return this.webhooks.receive(configId, signature, request.rawBody);
  }
}
