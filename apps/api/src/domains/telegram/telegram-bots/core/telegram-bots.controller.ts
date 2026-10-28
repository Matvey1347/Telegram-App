import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../../../common/current-user.decorator';
import type { JwtUser } from '../../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/jwt-auth.guard';
import {
  CreateTelegramBotDto,
  SwitchTelegramBotApplicationDto,
  UpdateTelegramBotDto,
  UpdateConfiguredSystemBotProfileDto,
  UpdateTelegramBotRuntimeProfileDto,
  UpsertTelegramBotRuntimeDto,
} from './dto';
import { TelegramBotsService } from './telegram-bots.service';
import { ConfiguredBotAnalyticsService } from './configured-bot-analytics.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-bots')
export class TelegramBotsController {
  constructor(
    private readonly service: TelegramBotsService,
    private readonly configuredBots: ConfiguredBotAnalyticsService,
  ) {}

  @Get() findAll(@CurrentUser() user: JwtUser) {
    return this.service.findAll(user.sub);
  }

  // Keep static paths above :id so "configured" is never parsed as a bot ID.
  @Get('configured')
  configuredOverview(@CurrentUser() user: JwtUser) {
    return this.configuredBots.overview(user.sub);
  }

  @Get('configured/system/avatar')
  async configuredSystemAvatar(
    @CurrentUser() user: JwtUser,
    @Query('environment') environment: 'LOCAL' | 'PRODUCTION',
    @Res() response: Response,
  ) {
    const avatar = await this.configuredBots.systemBotAvatar(
      user.sub,
      environment,
    );
    if (!avatar) return response.status(204).send();
    response.setHeader('Content-Type', avatar.contentType);
    // `version` in the overview URL changes only after the persisted bytes do.
    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return response.send(avatar.bytes);
  }

  @Post('configured/system/avatars/refresh')
  refreshConfiguredSystemAvatars(@CurrentUser() user: JwtUser) {
    return this.configuredBots.refreshSystemBotAvatars(user.sub);
  }

  @Patch('configured/system/:environment/profile')
  updateConfiguredSystemProfile(
    @CurrentUser() user: JwtUser,
    @Param('environment') environment: 'LOCAL' | 'PRODUCTION',
    @Body() dto: UpdateConfiguredSystemBotProfileDto,
  ) {
    return this.configuredBots.updateSystemBotProfile(user.sub, environment, {
      name: dto.name,
      description: dto.description,
    });
  }

  @Get('configured/finance/users')
  configuredFinanceUsers(
    @CurrentUser() user: JwtUser,
    @Query('environment') environment: 'LOCAL' | 'PRODUCTION',
    @Query('cursor') cursor?: string,
  ) {
    return this.configuredBots.financeUsers(user.sub, environment, cursor);
  }

  @Get('configured/finance/avatar')
  async configuredFinanceAvatar(
    @CurrentUser() user: JwtUser,
    @Query('environment') environment: 'LOCAL' | 'PRODUCTION',
    @Res() response: Response,
  ) {
    const avatar = await this.configuredBots.financeBotAvatar(
      user.sub,
      environment,
    );
    if (!avatar) return response.status(204).send();
    response.setHeader('Content-Type', avatar.contentType);
    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return response.send(avatar.bytes);
  }

  @Post('configured/finance/avatars/refresh')
  refreshConfiguredFinanceAvatars(@CurrentUser() user: JwtUser) {
    return this.configuredBots.refreshFinanceBotAvatars(user.sub);
  }

  @Patch('configured/finance/:environment/profile')
  updateConfiguredFinanceProfile(
    @CurrentUser() user: JwtUser,
    @Param('environment') environment: 'LOCAL' | 'PRODUCTION',
    @Body() dto: UpdateConfiguredSystemBotProfileDto,
  ) {
    return this.configuredBots.updateFinanceBotProfile(user.sub, environment, {
      name: dto.name,
      description: dto.description,
    });
  }

  @Post() create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTelegramBotDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Get(':id') findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.findOne(user.sub, id);
  }

  @Patch(':id') update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateTelegramBotDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }

  @Post(':id/application') switchApplication(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: SwitchTelegramBotApplicationDto,
  ) {
    return this.service.switchApplication(user.sub, id, dto);
  }

  @Post(':id/runtimes/:environment')
  upsertRuntime(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('environment') environment: 'LOCAL' | 'PRODUCTION',
    @Body() dto: UpsertTelegramBotRuntimeDto,
  ) {
    return this.service.upsertRuntime(user.sub, id, environment, dto);
  }

  @Post(':id/runtimes/:environment/check')
  checkRuntime(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('environment') environment: 'LOCAL' | 'PRODUCTION',
  ) {
    return this.service.checkRuntime(user.sub, id, environment);
  }

  @Patch(':id/runtimes/:environment/profile')
  @UseInterceptors(
    FileInterceptor('avatar', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  updateRuntimeProfile(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('environment') environment: 'LOCAL' | 'PRODUCTION',
    @Body() dto: UpdateTelegramBotRuntimeProfileDto,
    @UploadedFile() avatar: Express.Multer.File | undefined,
  ) {
    return this.service.updateRuntimeProfile(user.sub, id, environment, {
      name: dto.name,
      avatar,
    });
  }

  @Post(':id/runtimes/:environment/enable')
  enableRuntime(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('environment') environment: 'LOCAL' | 'PRODUCTION',
  ) {
    return this.service.enableRuntime(user.sub, id, environment);
  }

  @Post(':id/runtimes/:environment/disable')
  disableRuntime(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('environment') environment: 'LOCAL' | 'PRODUCTION',
  ) {
    return this.service.disableRuntime(user.sub, id, environment);
  }

  @Delete(':id/runtimes/:environment')
  removeRuntime(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('environment') environment: 'LOCAL' | 'PRODUCTION',
  ) {
    return this.service.removeRuntime(user.sub, id, environment);
  }

  @Get(':id/channels') channels(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.channels(user.sub, id);
  }

  @Delete(':id') remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
}
