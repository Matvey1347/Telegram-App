import { Module } from '@nestjs/common';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramCustomEmojiController } from './telegram-custom-emoji.controller';
import { TelegramCustomEmojiService } from './telegram-custom-emoji.service';
import { TelegramCustomEmojiStorageService } from './telegram-custom-emoji-storage.service';
@Module({
  controllers: [TelegramCustomEmojiController],
  providers: [TelegramCustomEmojiService, TelegramCustomEmojiStorageService, TelegramMtprotoClient],
  exports: [TelegramCustomEmojiService],
})
export class TelegramCustomEmojiModule {}
