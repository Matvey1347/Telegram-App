import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramManagedPostScheduledResetService } from './telegram-managed-post-scheduled-reset.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels')
export class TelegramManagedPostRecoveryController {
  constructor(
    private readonly scheduledReset: TelegramManagedPostScheduledResetService,
  ) {}

  @Post(':id/managed-posts/reset-scheduled-to-drafts')
  resetScheduledToDrafts(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
  ) {
    return this.scheduledReset.resetChannelScheduledPosts(user.sub, channelId);
  }
}
