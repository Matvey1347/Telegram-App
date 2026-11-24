import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramAiPostingAutopilotSettingsService } from './telegram-ai-posting-autopilot-settings.service';

class SetAutopilotDto {
  @IsBoolean() enabled!: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels/:channelId/ai-posting/autopilot')
export class TelegramAiPostingAutopilotController {
  constructor(
    private readonly settings: TelegramAiPostingAutopilotSettingsService,
  ) {}

  @Get()
  read(@CurrentUser() user: JwtUser, @Param('channelId') channelId: string) {
    return this.settings.read(user.sub, channelId);
  }

  @Put()
  update(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Body() dto: SetAutopilotDto,
  ) {
    return this.settings.update(user.sub, channelId, dto);
  }
}
