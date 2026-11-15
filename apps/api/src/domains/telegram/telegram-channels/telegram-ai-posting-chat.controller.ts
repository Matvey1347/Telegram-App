import { Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ArrayMaxSize, IsArray, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, type JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramAiPostingChatService } from './telegram-ai-posting-chat.service';
import { TelegramAiPostingGeneratorService } from './telegram-ai-posting-generator.service';
import { TelegramAiPostingChatMediaService } from './telegram-ai-posting-chat-media.service';

class GenerateChatPostDto { @IsString() @MinLength(1) @MaxLength(200) topic!: string; }

class ChatDto { @IsArray() messages!: unknown[]; @IsOptional() @IsArray() @ArrayMaxSize(3) @IsString({ each: true }) attachmentIds?: string[]; @IsOptional() @IsString() replyToMessageId?: string; @IsOptional() @IsObject() publication?: Record<string, unknown>; }

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels/:channelId/ai-posting/chat')
export class TelegramAiPostingChatController {
  constructor(private readonly chat: TelegramAiPostingChatService, private readonly generator: TelegramAiPostingGeneratorService, private readonly media: TelegramAiPostingChatMediaService) {}
  @Get() history(@CurrentUser() user: JwtUser, @Param('channelId') channelId: string) { return this.chat.history(user.sub, channelId); }
  @Post('generate') generate(@CurrentUser() user: JwtUser, @Param('channelId') channelId: string, @Body() dto: GenerateChatPostDto) {
    return this.generator.generate(user.sub, channelId, 1, 'MANUAL', undefined, undefined, dto.topic);
  }
  @Post('attachments') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 6 * 1024 * 1024 } }))
  attachment(@CurrentUser() user: JwtUser, @Param('channelId') channelId: string, @UploadedFile() file?: Express.Multer.File) {
    return this.media.analyzeAttachment(user.sub, channelId, file);
  }
  @Post() reply(@CurrentUser() user: JwtUser, @Param('channelId') channelId: string, @Body() dto: ChatDto) {
    return this.chat.reply(user.sub, channelId, dto.messages, dto.attachmentIds, dto.publication, dto.replyToMessageId);
  }
}
