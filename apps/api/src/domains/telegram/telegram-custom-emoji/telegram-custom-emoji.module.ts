import { Module } from '@nestjs/common';
import { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import { TelegramCustomEmojiController } from './telegram-custom-emoji.controller';
import { TelegramCustomEmojiService } from './telegram-custom-emoji.service';
import { TelegramCustomEmojiStorageService } from './telegram-custom-emoji-storage.service';
import { ChannelAvatarEmojiDocumentsService } from './channel-avatar-emoji-documents.service';
@Module({
  controllers: [TelegramCustomEmojiController],
  providers: [
    TelegramCustomEmojiService,
    TelegramCustomEmojiStorageService,
    ChannelAvatarEmojiDocumentsService,
    TelegramMtprotoClient,
  ],
  exports: [TelegramCustomEmojiService],
})
export class TelegramCustomEmojiModule {}
