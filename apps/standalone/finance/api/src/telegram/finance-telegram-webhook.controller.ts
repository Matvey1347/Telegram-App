import { Body, Controller, Headers, Post } from '@nestjs/common';
import { FinanceTelegramWebhookService } from './finance-telegram-webhook.service';
import type { FinanceTelegramWebhookUpdate } from './finance-telegram-webhook.types';

@Controller('telegram/finance')
export class FinanceTelegramWebhookController {
  constructor(private readonly webhook: FinanceTelegramWebhookService) {}

  @Post('webhook')
  receive(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: FinanceTelegramWebhookUpdate,
  ) {
    return this.webhook.receive(secret, update);
  }
}
