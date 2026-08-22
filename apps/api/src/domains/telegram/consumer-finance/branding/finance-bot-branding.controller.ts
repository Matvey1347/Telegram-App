import {
  BadRequestException,
  Controller,
  Body,
  Get,
  NotFoundException,
  Param,
  Patch,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { TelegramBotRuntimeEnvironment } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../../../../common/current-user.decorator';
import type { JwtUser } from '../../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/jwt-auth.guard';
import { FinanceBotBrandingService } from './finance-bot-branding.service';
import { TelegramBotsService } from '../../telegram-bots/core/telegram-bots.service';

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
        { name: 'logo', maxCount: 1 },
        { name: 'favicon', maxCount: 1 },
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
    files: { logo?: Express.Multer.File[]; favicon?: Express.Multer.File[] },
  ) {
    if (body.confirmTelegramUpdate !== 'true') {
      throw new BadRequestException(
        'Telegram profile update must be confirmed',
      );
    }
    await this.branding.update(user.sub, botId, environment, {
      name: body.name,
      logo: files?.logo?.[0],
      favicon: files?.favicon?.[0],
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
    @Param('kind') kind: 'logo' | 'favicon',
    @Res() response: Response,
  ) {
    if (kind !== 'logo' && kind !== 'favicon') {
      throw new NotFoundException();
    }
    const asset = await this.branding.asset(botId, kind);
    response.setHeader('Content-Type', asset.contentType);
    response.setHeader('Cache-Control', 'no-cache');
    if (asset.updatedAt)
      response.setHeader('Last-Modified', asset.updatedAt.toUTCString());
    response.send(asset.bytes);
  }
}
