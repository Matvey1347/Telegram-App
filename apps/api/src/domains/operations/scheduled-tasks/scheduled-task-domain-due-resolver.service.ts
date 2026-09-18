import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { MutualPromotionLifecycleService } from '../../growth/mutual-promotion-folders/mutual-promotion-lifecycle.service';
import { TelegramPostBatchLifecycleService } from '../../telegram/telegram-channels/telegram-post-batch-lifecycle.service';
import { CrossPromotionPlanLifecycleService } from '../../growth/cross-promotion-plans/cross-promotion-plan-lifecycle.service';

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
    const [lifecycle, direct] = await Promise.all([
      this.moduleRef.resolve<MutualPromotionLifecycleService>(
        MutualPromotionLifecycleService,
        undefined,
        { strict: false },
      ),
      this.moduleRef.resolve<CrossPromotionPlanLifecycleService>(
        CrossPromotionPlanLifecycleService,
        undefined,
        { strict: false },
      ),
    ]);
    const values = (
      await Promise.all([lifecycle.nextDueAt(), direct.nextDueAt()])
    )
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => left.getTime() - right.getTime());
    return values[0] ?? null;
  }
}
