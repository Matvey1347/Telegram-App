import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { AttachTelegramCustomEmojiPackDto, ImportTelegramCustomEmojiPackDto } from './telegram-custom-emoji.dto';
import { TelegramCustomEmojiService } from './telegram-custom-emoji.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels/:channelId/custom-emoji-packs')
export class TelegramCustomEmojiController {
  constructor(private readonly service: TelegramCustomEmojiService) {}
  @Get() list(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
  ) {
    return this.service.list(user.sub, channelId);
  }
  @Post('import') import(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Body() dto: ImportTelegramCustomEmojiPackDto,
  ) {
    return this.service.importPack(user.sub, channelId, {
      source: dto.source,
      scope: dto.scope,
      channelIds: dto.channelIds,
    });
  }
  @Post(':packId/attach') attach(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Param('packId') packId: string, @Body() dto: AttachTelegramCustomEmojiPackDto,
  ) {
    return this.service.attach(user.sub, channelId, packId, dto.scope === 'ALL_CHANNELS'
      ? { scope: 'ALL_CHANNELS' }
      : { scope: 'CHANNELS', channelIds: dto.channelIds ?? [] });
  }
  @Delete(':packId') detach(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Param('packId') packId: string,
    @Body() dto: AttachTelegramCustomEmojiPackDto,
  ) {
    return this.service.detach(user.sub, channelId, packId, dto.scope === 'ALL_CHANNELS' ? { scope: 'ALL_CHANNELS' } : { scope: 'CHANNELS', channelIds: dto.channelIds ?? [] });
  }
}
