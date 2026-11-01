import { TelegramCrmManualSendIntentService } from './telegram-crm-manual-send-intent.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramCrmHistoryService } from './telegram-crm-history.service';
import {
  ImportCrmHistoryDto,
  SendCrmManualMessageDto,
} from './telegram-crm-inbox.dto';
import { TelegramCrmInitialSyncService } from './telegram-crm-initial-sync.service';
import { TelegramCrmManualSendService } from './telegram-crm-manual-send.service';
import { TelegramCrmReadService } from './telegram-crm-read.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-crm')
export class TelegramCrmRuntimeController {
  constructor(
    private readonly initialSync: TelegramCrmInitialSyncService,
    private readonly history: TelegramCrmHistoryService,
    private readonly sends: TelegramCrmManualSendService,
    private readonly reads: TelegramCrmReadService,
    private readonly intents: TelegramCrmManualSendIntentService,
  ) {}

  @Post('accounts/:accountId/initial-sync')
  syncAccount(
    @CurrentUser() user: JwtUser,
    @Param('accountId') accountId: string,
  ) {
    return this.initialSync.run(user.sub, accountId);
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: SendCrmManualMessageDto,
  ) {
    return this.sends.send(user.sub, id, dto);
  }

  @Get('conversations/:id/manual-send-receipt')
  receipt(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query('clientIdempotencyKey') key: string,
  ) {
    return this.intents.lookup(user.sub, id, key);
  }

  @Post('conversations/:id/read')
  markRead(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.reads.markRead(user.sub, id);
  }

  @Post('conversations/:id/history')
  importHistory(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: ImportCrmHistoryDto,
  ) {
    return this.history.import(user.sub, id, dto);
  }
}
