import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { CrmInboxConversationsQueryDto } from './telegram-crm-inbox-conversations.dto';
import { TelegramCrmInboxConversationsService } from './telegram-crm-inbox-conversations.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-crm/inbox')
export class TelegramCrmInboxConversationsController {
  constructor(
    private readonly conversations: TelegramCrmInboxConversationsService,
  ) {}

  @Get('conversations')
  list(
    @CurrentUser() user: JwtUser,
    @Query() query: CrmInboxConversationsQueryDto,
  ) {
    return this.conversations.list(user.sub, query);
  }
}
