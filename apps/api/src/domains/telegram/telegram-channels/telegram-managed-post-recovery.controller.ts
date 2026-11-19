import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { StreamResponseService } from '../../../common/stream/stream-response.service';
import { TelegramManagedPostScheduledResetService } from './telegram-managed-post-scheduled-reset.service';
import { TelegramManagedPostRescheduleBatchDto } from './telegram-managed-post-reschedule-batch.dto';
import { TelegramManagedPostRecoverySnapshotService } from './telegram-managed-post-recovery-snapshot.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels')
export class TelegramManagedPostRecoveryController {
  constructor(
    private readonly scheduledReset: TelegramManagedPostScheduledResetService,
    private readonly streams: StreamResponseService,
    private readonly snapshot: TelegramManagedPostRecoverySnapshotService,
  ) {}

  @Get(':id/recovery-managed-posts-snapshot')
  recoverySnapshot(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
  ) {
    return this.snapshot.snapshot(user.sub, channelId);
  }

  @Post(':id/managed-posts/reset-scheduled-to-drafts')
  resetScheduledToDrafts(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
  ) {
    return this.scheduledReset.resetChannelScheduledPosts(user.sub, channelId);
  }

  @Post(':id/managed-posts/reschedule-all')
  rescheduleAll(@CurrentUser() user: JwtUser, @Param('id') channelId: string) {
    return this.scheduledReset.rescheduleChannelScheduledPosts(
      user.sub,
      channelId,
    );
  }

  @Post(':id/managed-posts/reschedule-all-stream')
  rescheduleAllStream(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
    @Body() body: TelegramManagedPostRescheduleBatchDto,
    @Res() response: Response,
  ) {
    return this.streams.stream(response, {
      eventPrefix: 'telegram_channel.managed_posts_reschedule_all',
      // Telegram may take a while to accept a scheduled media post. Keep
      // Railway's idle stream alive while the per-post operation is running.
      heartbeatIntervalMs: 15_000,
      action: (onProgress) =>
        this.scheduledReset.rescheduleChannelScheduledPosts(
          user.sub,
          channelId,
          onProgress,
          body.postIds,
        ),
    });
  }

  @Get(':id/reschedule-managed-posts-plan')
  rescheduleAllCandidates(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
  ) {
    return this.scheduledReset.listChannelRescheduleCandidates(
      user.sub,
      channelId,
    );
  }
}
