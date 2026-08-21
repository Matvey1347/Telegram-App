import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { TelegramBotRuntimeService } from './telegram-bot-runtime.service';
import { TelegramBotLocalDevelopmentService } from './telegram-bot-local-development.service';
import type { TelegramBotWebhookUpdate } from './telegram-bot-update.types';

@Controller('telegram/bots/runtime')
export class TelegramBotRuntimeController {
  constructor(
    private readonly runtime: TelegramBotRuntimeService,
    private readonly localDevelopment: TelegramBotLocalDevelopmentService,
  ) {}

  @Post('local-development/start')
  startLocalDevelopment(
    @Headers('x-local-dev-control-secret') secret: string | undefined,
  ) {
    return this.localDevelopment.start(secret);
  }

  @Post('local-development/stop')
  stopLocalDevelopment(
    @Headers('x-local-dev-control-secret') secret: string | undefined,
  ) {
    return this.localDevelopment.stop(secret);
  }

  @Post(':id/webhook')
  webhook(
    @Param('id') id: string,
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: TelegramBotWebhookUpdate,
  ) {
    return this.runtime.handleWebhook(id, secret, update);
  }
}
