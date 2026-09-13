import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { StreamResponseService } from '../../../common/stream/stream-response.service';
import {
  ImportTelegramChannelDto,
  ImportTelegramChannelsBatchDto,
} from './dto';
import { TelegramChannelImportService } from './telegram-channel-import.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels')
export class TelegramChannelImportController {
  constructor(
    private readonly imports: TelegramChannelImportService,
    private readonly streamResponse: StreamResponseService,
  ) {}

  @Post('import')
  import(@CurrentUser() user: JwtUser, @Body() dto: ImportTelegramChannelDto) {
    return this.imports.importChannel(user.sub, dto);
  }

  @Post('import-stream')
  importStream(
    @CurrentUser() user: JwtUser,
    @Body() dto: ImportTelegramChannelDto,
    @Res() response: Response,
  ) {
    return this.streamResponse.stream(response, {
      eventPrefix: 'telegram_channel.import_stream',
      action: (onProgress) =>
        this.imports.importChannel(user.sub, dto, onProgress as never),
    });
  }

  @Post('import-batch-stream')
  importBatchStream(
    @CurrentUser() user: JwtUser,
    @Body() dto: ImportTelegramChannelsBatchDto,
    @Res() response: Response,
  ) {
    return this.streamResponse.stream(response, {
      eventPrefix: 'telegram_channel.import_batch_stream',
      action: (onProgress) =>
        this.imports.importChannels(user.sub, dto.inputs, onProgress as never),
    });
  }
}
