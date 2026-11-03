import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { CrmInboxConversationsQueryDto, SetCrmUnreadIgnoredDto } from './telegram-crm-inbox-conversations.dto';
import { TelegramCrmInboxFoldersService } from './telegram-crm-inbox-folders.service';
import { TelegramCrmInboxConversationsService } from './telegram-crm-inbox-conversations.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-crm/inbox')
export class TelegramCrmInboxConversationsController {
  constructor(
    private readonly conversations: TelegramCrmInboxConversationsService,
    private readonly folders: TelegramCrmInboxFoldersService,
  ) {}

  @Get('folders')
  listFolders(@CurrentUser() user: JwtUser) {
    return this.folders.list(user.sub);
  }

  @Post('conversations/:id/unread-ignore')
  setUnreadIgnored(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SetCrmUnreadIgnoredDto) {
    return this.conversations.setIgnoreInUnread(user.sub, id, dto.ignored);
  }

  @Get('conversations')
  list(
    @CurrentUser() user: JwtUser,
    @Query() query: CrmInboxConversationsQueryDto,
  ) {
    return this.conversations.list(user.sub, query);
  }
}
