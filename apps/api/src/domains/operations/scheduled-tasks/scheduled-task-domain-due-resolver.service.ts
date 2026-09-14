import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { MutualPromotionLifecycleService } from '../../growth/mutual-promotion-folders/mutual-promotion-lifecycle.service';
import { TelegramPostBatchLifecycleService } from '../../telegram/telegram-channels/telegram-post-batch-lifecycle.service';

@Injectable()
export class ScheduledTaskDomainDueResolverService {
  constructor(private readonly moduleRef: ModuleRef) {}

  async nextDueAt(taskKey: string): Promise<Date | null | undefined> {
    if (taskKey === 'telegram.post_batches.lifecycle') {
      const lifecycle =
        await this.moduleRef.resolve<TelegramPostBatchLifecycleService>(
          TelegramPostBatchLifecycleService,
          undefined,
          { strict: false },
        );
      return lifecycle.nextDueAt();
    }
    if (taskKey !== 'mutual_promotion.lifecycle') return undefined;
    const lifecycle =
      await this.moduleRef.resolve<MutualPromotionLifecycleService>(
        MutualPromotionLifecycleService,
        undefined,
        { strict: false },
      );
    return lifecycle.nextDueAt();
  }
}
