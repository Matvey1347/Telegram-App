import { channelAvatarEmojiOwnerAccessWhere } from './channel-avatar-emoji-ownership';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { scheduledTaskWakeNotifier } from '../../../common/scheduled-task-wake-notifier';
import { ChannelAvatarEmojiApi } from '@api/telegram/shared/emoji/channel-avatar-emoji-api';
import { ChannelAvatarEmojiProcessorService } from './channel-avatar-emoji-processor.service';

/** One nearest-due timer; empty/disabled worker has no timer and no polling. */
@Injectable()
export class ChannelAvatarEmojiWorkerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: ChannelAvatarEmojiProcessorService,
    private readonly api: ChannelAvatarEmojiApi,
  ) {}
  private timer?: NodeJS.Timeout;
  private running = false;
  private wakeAgain = false;
  private destroyed = false;
  private readonly logger = new Logger(ChannelAvatarEmojiWorkerService.name);
  private readonly changed = (key: string) => {
    if (key === 'channel-avatar-emoji') void this.wake();
  };
  onApplicationBootstrap() {
    scheduledTaskWakeNotifier.on('changed', this.changed);
    void this.wake();
  }
  onModuleDestroy() {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
    scheduledTaskWakeNotifier.off('changed', this.changed);
  }
  private async wake() {
    if (this.destroyed || !this.api.configured()) return;
    if (this.running) {
      this.wakeAgain = true;
      return;
    }
    this.running = true;
    if (this.timer) clearTimeout(this.timer);
    try {
      // At most ten attempts per wake; overdue continuation uses the same timer.
      for (let index = 0; index < 10 && !this.destroyed; index++) {
        const next = await this.prisma.telegramChannel.findFirst({
          where: {
            avatarEmojiRetryAt: { not: null },
            sourceAccesses: { some: channelAvatarEmojiOwnerAccessWhere() },
          },
          orderBy: { avatarEmojiRetryAt: 'asc' },
          select: { id: true, workspaceId: true, avatarEmojiRetryAt: true },
        });
        if (!next?.avatarEmojiRetryAt) return;
        const delay = next.avatarEmojiRetryAt.getTime() - Date.now();
        if (delay > 0 || index === 9) {
          this.timer = setTimeout(
            () => {
              void this.wake();
            },
            Math.min(Math.max(50, delay), 2_147_483_647),
          );
          this.timer.unref();
          return;
        }
        await this.processor.process(next.workspaceId, next.id);
      }
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error.code === 'P2021' || error.code === 'P2022')
      ) {
        this.logger.warn(
          'Avatar emoji schema is unavailable; apply the tracked migration and restart the API.',
        );
        return;
      }
      // Infrastructure failure only: one bounded recovery wake, no persisted logs.
      this.logger.warn(
        'Avatar emoji worker could not access due work; retrying in one minute.',
      );
      this.timer = setTimeout(() => {
        void this.wake();
      }, 60_000);
      this.timer.unref();
    } finally {
      this.running = false;
      if (this.wakeAgain) {
        this.wakeAgain = false;
        void this.wake();
      }
    }
  }
}
