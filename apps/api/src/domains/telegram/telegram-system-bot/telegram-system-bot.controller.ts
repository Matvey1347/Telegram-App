import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramSystemBotConnectionsService } from './telegram-system-bot-connections.service';
import { TelegramSystemBotHandlerService } from './telegram-system-bot-handler.service';
import { TelegramSystemBotRuntimeService } from './telegram-system-bot-runtime.service';
import type { TelegramSystemBotUpdate } from './telegram-system-bot-handler.service';
import {
  TelegramSystemBotSubscriptionsQueryDto,
  UpdateTelegramSystemBotGroupSubscriptionsDto,
  UpdateTelegramSystemBotSubscriptionDto,
} from './dto';

@Controller('telegram/system-bot')
export class TelegramSystemBotController {
  constructor(
    private readonly connections: TelegramSystemBotConnectionsService,
    private readonly runtime: TelegramSystemBotRuntimeService,
    private readonly handler: TelegramSystemBotHandlerService,
  ) {}

  @Post('webhook')
  webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: TelegramSystemBotUpdate,
  ) {
    return this.runtime.handleWebhook(secret, update);
  }

  @UseGuards(JwtAuthGuard)
  @Get('connection')
  connection(@CurrentUser() user: JwtUser) {
    return this.connections.status(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('connect/preview')
  preview(@CurrentUser() user: JwtUser, @Query('token') token: string) {
    return this.connections.previewLink(user.sub, token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('connect')
  async connect(@CurrentUser() user: JwtUser, @Body('token') token: string) {
    const confirmed = await this.connections.confirmLink(user.sub, token);
    await this.handler.completeConnection({
      chatId: confirmed.telegramChatId,
      messageId: confirmed.telegramMessageId,
      connectionId: confirmed.connectionId,
    });
    return confirmed.status;
  }

  @UseGuards(JwtAuthGuard)
  @Delete('connection')
  disconnect(@CurrentUser() user: JwtUser) {
    return this.connections.disconnect(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscriptions')
  updateSubscription(
    @CurrentUser() user: JwtUser,
    @Body() payload: UpdateTelegramSystemBotSubscriptionDto,
  ) {
    return this.connections.updateSubscription(user.sub, payload);
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscriptions/group')
  updateGroupSubscriptions(
    @CurrentUser() user: JwtUser,
    @Body() payload: UpdateTelegramSystemBotGroupSubscriptionsDto,
  ) {
    return this.connections.updateGroupSubscriptions(user.sub, payload);
  }

  @UseGuards(JwtAuthGuard)
  @Get('subscriptions')
  subscriptions(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramSystemBotSubscriptionsQueryDto,
  ) {
    return this.connections.subscriptions(user.sub, query.workspaceId);
  }
}
