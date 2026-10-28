import {
  BadRequestException,
  Controller,
  Body,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { TelegramBotRuntimeEnvironment } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '@api/common/current-user.decorator';
import type { JwtUser } from '@api/common/current-user.decorator';
import { JwtAuthGuard } from '@api/common/jwt-auth.guard';
import { FinanceBotBrandingService } from '@consumer-finance/api/branding/finance-bot-branding.service';
import { TelegramBotsService } from '@api/domains/telegram/telegram-bots/core/telegram-bots.service';

@Controller('telegram-bots/:botId/finance-branding')
@UseGuards(JwtAuthGuard)
export class FinanceBotBrandingAdminController {
  constructor(
    private readonly branding: FinanceBotBrandingService,
    private readonly bots: TelegramBotsService,
  ) {}

  @Patch(':environment')
  async update(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('environment') environment: TelegramBotRuntimeEnvironment,
    @Body() body: { name?: string; confirmTelegramUpdate?: string },
  ) {
    if (body.confirmTelegramUpdate !== 'true') {
      throw new BadRequestException(
        'Telegram profile update must be confirmed',
      );
    }
    await this.branding.update(user.sub, botId, environment, { name: body.name });
    return this.bots.findOne(user.sub, botId);
  }
}

@Controller('finance-bots/:botId/branding')
export class FinanceBotBrandingAssetController {
  constructor(private readonly branding: FinanceBotBrandingService) {}

  @Get(':kind')
  async asset(
    @Param('botId') botId: string,
    @Param('kind') kind: 'favicon' | 'favicon-light',
    @Query('environment') environment: string | undefined,
    @Res() response: Response,
  ) {
    if (kind !== 'favicon' && kind !== 'favicon-light') {
      throw new NotFoundException();
    }
    if (
      environment &&
      environment !== 'LOCAL' &&
      environment !== 'PRODUCTION'
    ) {
      throw new NotFoundException();
    }
    const asset = await this.branding.asset(
      botId,
      kind,
      environment as TelegramBotRuntimeEnvironment | undefined,
    );
    response.setHeader('Content-Type', asset.contentType);
    response.setHeader('Cache-Control', 'public, max-age=300');
    response.send(asset.bytes);
  }
}
