import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import type { ConsumerFinanceAssistantChatMode } from '@telegram-system/shared';
import { FinanceConsumerRequestService } from '@consumer-finance/api/http/finance-consumer-request.service';
import { FinanceAssistantChatsService } from './finance-assistant-chats.service';

class RenameChatDto {
  @IsString() @MinLength(1) @MaxLength(80) title!: string;
}
class CreateChatDto extends RenameChatDto {
  @IsOptional() @IsUUID() chatId?: string;
  @IsIn(['GENERAL', 'ADVICE', 'TRANSACTIONS']) mode!: ConsumerFinanceAssistantChatMode;
}
class MoveChatDto {
  @IsBoolean() archived!: boolean;
}
class PageDto {
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @IsIn(['true', 'false']) archived?: string;
}

@Controller('finance-bots/:botId/ultimate/chats')
export class FinanceAssistantChatsController {
  constructor(
    private readonly requests: FinanceConsumerRequestService,
    private readonly chats: FinanceAssistantChatsService,
  ) {}

  @Get()
  list(@Param('botId') botId: string, @Req() request: Request, @Query() page: PageDto) {
    return this.chats.list(this.identity(botId, request), page.cursor, page.archived === 'true');
  }

  @Post()
  create(@Param('botId') botId: string, @Req() request: Request, @Body() body: CreateChatDto) {
    return this.chats.create(this.identity(botId, request), body.title, body.mode, body.chatId);
  }

  @Get(':chatId')
  get(@Param('botId') botId: string, @Param('chatId', ParseUUIDPipe) chatId: string, @Req() request: Request) {
    return this.chats.get(this.identity(botId, request), chatId);
  }

  @Patch(':chatId')
  rename(@Param('botId') botId: string, @Param('chatId', ParseUUIDPipe) chatId: string, @Req() request: Request, @Body() body: RenameChatDto) {
    return this.chats.rename(this.identity(botId, request), chatId, body.title);
  }

  @Patch(':chatId/archive')
  move(@Param('botId') botId: string, @Param('chatId', ParseUUIDPipe) chatId: string, @Req() request: Request, @Body() body: MoveChatDto) {
    return this.chats.move(this.identity(botId, request), chatId, body.archived);
  }

  @Delete(':chatId')
  @HttpCode(204)
  remove(@Param('botId') botId: string, @Param('chatId', ParseUUIDPipe) chatId: string, @Req() request: Request) {
    return this.chats.remove(this.identity(botId, request), chatId);
  }

  @Get(':chatId/turns')
  turns(@Param('botId') botId: string, @Param('chatId', ParseUUIDPipe) chatId: string, @Req() request: Request, @Query() page: PageDto) {
    return this.chats.turns(this.identity(botId, request), chatId, page.cursor);
  }

  private identity(botIntegrationId: string, request: Request) {
    const { profileId, telegramBotUserId } = this.requests.authenticate(botIntegrationId, request);
    return { profileId, botIntegrationId, telegramBotUserId };
  }
}
