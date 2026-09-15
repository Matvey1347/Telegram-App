import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { StreamResponseService } from '../../../common/stream/stream-response.service';
import { TelegramUnifiedImportDto } from './telegram-unified-import.dto';
import { TelegramUnifiedImportService } from './telegram-unified-import.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels/:channelId/unified-import')
export class TelegramUnifiedImportController {
  constructor(
    private readonly service: TelegramUnifiedImportService,
    private readonly streams: StreamResponseService,
  ) {}

  @Post('preview')
  preview(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Body() dto: TelegramUnifiedImportDto,
  ) {
    return this.service.preview(user.sub, channelId, dto);
  }

  @Post('apply-stream')
  applyStream(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Headers('x-manifest-hash') manifestHash: string,
    @Body() dto: TelegramUnifiedImportDto,
    @Res() response: Response,
  ) {
    return this.streams.stream(response, {
      eventPrefix: 'telegram_channel.unified_import.apply',
      action: (onProgress, signal) =>
        this.service.apply(
          user.sub,
          channelId,
          dto,
          manifestHash,
          onProgress,
          signal,
        ),
    });
  }
}
