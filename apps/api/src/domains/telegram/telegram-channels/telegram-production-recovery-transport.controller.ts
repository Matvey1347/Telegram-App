import {
  Body,
  Controller,
  Get,
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
import { TelegramOperatorSendDto } from './telegram-operator-send.dto';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import { TelegramOperatorSendService } from './telegram-operator-send.service';
import { TelegramProductionRecoveryTransportService } from './telegram-production-recovery-transport.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels')
export class TelegramProductionRecoveryTransportController {
  constructor(
    private readonly transport: TelegramProductionRecoveryTransportService,
    private readonly operator: TelegramOperatorSendService,
    private readonly groups: TelegramPostGroupsService,
  ) {}

  @Post(':id/repair-post-groups')
  repairPostGroups(@CurrentUser() user: JwtUser, @Param('id') channelId: string) {
    return this.groups.repairChannelSystemGroups(user.sub, channelId);
  }

  @Post(':id/operator-send')
  async operatorSend(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
    @Body() body: TelegramOperatorSendDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cancellation = new AbortController();
    const abort = () => cancellation.abort();
    response.once('close', abort);
    try {
      return { result: await this.operator.send(user.sub, channelId, body, cancellation.signal) };
    } finally {
      response.removeListener('close', abort);
    }
  }

  @Get(':id/operator-publication-evidence/:postId')
  async verifyExisting(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
    @Param('postId') postId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const cancellation = new AbortController();
    const abort = () => cancellation.abort();
    response.once('close', abort);
    try {
      return { verified: await this.operator.verifyExisting(user.sub, channelId, postId, cancellation.signal) };
    } finally {
      response.removeListener('close', abort);
    }
  }

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

/** Public release metadata used before the operator can start its login screen. */
@Controller('telegram-operator-contract')
export class TelegramOperatorContractController {
  @Get()
  version() {
    return { publicationTransport: 1 };
  }
}
