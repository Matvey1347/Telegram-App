import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramProductionRecoveryTransportDto } from './telegram-production-recovery-transport.dto';
import { TelegramProductionRecoveryTransportService } from './telegram-production-recovery-transport.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels')
export class TelegramProductionRecoveryTransportController {
  constructor(
    private readonly transport: TelegramProductionRecoveryTransportService,
  ) {}

  @Post(':id/recovery-transport')
  async execute(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
    @Body() body: TelegramProductionRecoveryTransportDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cancellation = new AbortController();
    const abort = () => {
      if (!response.writableEnded) cancellation.abort();
    };
    request.once('aborted', abort);
    response.once('close', abort);
    try {
      return {
        result: await this.transport.execute(
          user.sub,
          channelId,
          body,
          cancellation.signal,
        ),
      };
    } finally {
      request.removeListener('aborted', abort);
      response.removeListener('close', abort);
    }
  }
}
