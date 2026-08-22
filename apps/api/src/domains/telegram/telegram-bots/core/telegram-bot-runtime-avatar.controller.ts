import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { TelegramBotProfileService } from './telegram-bot-profile.service';

@Controller('telegram-bot-runtime-avatars')
export class TelegramBotRuntimeAvatarController {
  constructor(private readonly profiles: TelegramBotProfileService) {}

  @Get(':runtimeId')
  async avatar(@Param('runtimeId') runtimeId: string, @Res() response: Response) {
    const avatar = await this.profiles.avatar(runtimeId);
    response.setHeader('Content-Type', avatar.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.send(avatar.bytes);
  }
}
