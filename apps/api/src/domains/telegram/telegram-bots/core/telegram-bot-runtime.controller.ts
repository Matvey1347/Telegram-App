import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { TelegramBotRuntimeService } from './telegram-bot-runtime.service';
import type { TelegramBotWebhookUpdate } from './telegram-bot-update.types';

@Controller('telegram/bots/runtime')
export class TelegramBotRuntimeController {
  constructor(private readonly runtime: TelegramBotRuntimeService) {}

  @Post(':id/webhook')
  webhook(
    @Param('id') id: string,
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: TelegramBotWebhookUpdate,
  ) {
    return this.runtime.handleWebhook(id, secret, update);
  }
}
