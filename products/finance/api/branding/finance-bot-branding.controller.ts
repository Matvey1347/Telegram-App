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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
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
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'favicon', maxCount: 1 },
        { name: 'faviconLight', maxCount: 1 },
      ],
      { limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async update(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('environment') environment: TelegramBotRuntimeEnvironment,
    @Body() body: { name?: string; confirmTelegramUpdate?: string },
    @UploadedFiles()
    files: { favicon?: Express.Multer.File[]; faviconLight?: Express.Multer.File[] },
  ) {
    if (body.confirmTelegramUpdate !== 'true') {
      throw new BadRequestException(
        'Telegram profile update must be confirmed',
      );
    }
    await this.branding.update(user.sub, botId, environment, {
      name: body.name,
      favicon: files?.favicon?.[0],
      faviconLight: files?.faviconLight?.[0],
    });
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
    @Query('version') version: string | undefined,
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
    response.setHeader(
      'Cache-Control',
      version ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
    if (asset.updatedAt)
      response.setHeader('Last-Modified', asset.updatedAt.toUTCString());
    response.send(asset.bytes);
  }
}
