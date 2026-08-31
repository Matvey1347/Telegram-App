import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramCrmContactCommandService } from './telegram-crm-contact-command.service';
import { TelegramCrmContactReadService } from './telegram-crm-contact-read.service';
import { TelegramCrmConversationService } from './telegram-crm-conversation.service';
import {
  CreateCrmContactDto,
  CreateCrmConversationDto,
  CrmContactsQueryDto,
  CrmConversationsQueryDto,
  CrmMessagesQueryDto,
  UpdateCrmContactDto,
  UpdateCrmWorkspaceSettingsDto,
  UpsertCrmPeerDto,
} from './telegram-crm.dto';
import { TelegramCrmMessageReadService } from './telegram-crm-message-read.service';
import { TelegramCrmPeerService } from './telegram-crm-peer.service';
import { TelegramCrmSettingsService } from './telegram-crm-settings.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-crm')
export class TelegramCrmController {
  constructor(
    private readonly contactRead: TelegramCrmContactReadService,
    private readonly contactCommands: TelegramCrmContactCommandService,
    private readonly peers: TelegramCrmPeerService,
    private readonly conversations: TelegramCrmConversationService,
    private readonly messages: TelegramCrmMessageReadService,
    private readonly settings: TelegramCrmSettingsService,
  ) {}

  @Get('contacts')
  listContacts(
    @CurrentUser() user: JwtUser,
    @Query() query: CrmContactsQueryDto,
  ) {
    return this.contactRead.list(user.sub, query);
  }

  @Post('contacts')
  createContact(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateCrmContactDto,
  ) {
    return this.contactCommands.create(user.sub, dto);
  }

  @Patch('contacts/:id')
  updateContact(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateCrmContactDto,
  ) {
    return this.contactCommands.update(user.sub, id, dto);
  }

  @Post('contacts/:id/archive')
  archiveContact(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.contactCommands.archive(user.sub, id);
  }

  @Post('contacts/:id/restore')
  restoreContact(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.contactCommands.restore(user.sub, id);
  }

  @Post('peers')
  upsertPeer(@CurrentUser() user: JwtUser, @Body() dto: UpsertCrmPeerDto) {
    return this.peers.upsert(user.sub, dto);
  }

  @Post('conversations')
  createConversation(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateCrmConversationDto,
  ) {
    return this.conversations.create(user.sub, dto);
  }

  @Get('conversations')
  listConversations(
    @CurrentUser() user: JwtUser,
    @Query() query: CrmConversationsQueryDto,
  ) {
    return this.conversations.list(user.sub, query);
  }

  @Get('conversations/:id/messages')
  listMessages(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query() query: CrmMessagesQueryDto,
  ) {
    return this.messages.list(user.sub, id, query);
  }

  @Get('settings')
  getSettings(@CurrentUser() user: JwtUser) {
    return this.settings.get(user.sub);
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateCrmWorkspaceSettingsDto,
  ) {
    return this.settings.update(user.sub, dto);
  }
}
