import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { ChannelAvatarEmojiService } from './channel-avatar-emoji.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels/:id/avatar-emoji')
export class ChannelAvatarEmojiController {
  constructor(private readonly emojis: ChannelAvatarEmojiService) {}
  @Post('refresh') refresh(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.emojis.refresh(user.sub, id);
  }
  @Post('restore') restore(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.emojis.restore(user.sub, id);
  }
}
