import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { StreamResponseService } from '../../../common/stream/stream-response.service';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  ImportTelegramCustomEmojiPackDto,
  ResolveTelegramCustomEmojiDocumentsDto,
} from './telegram-custom-emoji.dto';
import { TelegramCustomEmojiService } from './telegram-custom-emoji.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-custom-emoji-packs')
export class TelegramCustomEmojiController {
  constructor(
    private readonly service: TelegramCustomEmojiService,
    private readonly streams: StreamResponseService,
  ) {}
  @Get() list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.sub);
  }
  @Post('import') import(
    @CurrentUser() user: JwtUser,
    @Body() dto: ImportTelegramCustomEmojiPackDto,
  ) {
    return this.service.importPack(user.sub, { source: dto.source });
  }
  @Post('resolve') resolveDocuments(
    @CurrentUser() user: JwtUser,
    @Body() dto: ResolveTelegramCustomEmojiDocumentsDto,
    @Res() res: Response,
  ) {
    return this.streams.stream(res, {
      eventPrefix: 'telegram_custom_emoji.resolve',
      persistLifecycleLogs: false,
      action: (onProgress, signal) =>
        this.service.resolveDocuments(
          user.sub,
          dto.documentIds,
          onProgress,
          signal,
        ),
    });
  }
  @Delete(':packId') detach(
    @CurrentUser() user: JwtUser,
    @Param('packId') packId: string,
  ) {
    return this.service.deletePack(user.sub, packId);
  }
}
