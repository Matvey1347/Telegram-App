import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { MutualPromotionLifecycleService } from '../../growth/mutual-promotion-folders/mutual-promotion-lifecycle.service';

@Injectable()
export class ScheduledTaskDomainDueResolverService {
  constructor(private readonly moduleRef: ModuleRef) {}

  async nextDueAt(taskKey: string): Promise<Date | null | undefined> {
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
