import { Module } from '@nestjs/common';
import { FinanceCategoriesModule } from '../../finance/finance-categories/finance-categories.module';
import { TelegramChannelsModule } from '../../telegram/telegram-channels/telegram-channels.module';
import { MutualPromotionCommandService } from './mutual-promotion-command.service';
import { MutualPromotionBoundaryService } from './mutual-promotion-boundary.service';
import { MutualPromotionActivationService } from './mutual-promotion-activation.service';
import { MutualPromotionExpenseService } from './mutual-promotion-expense.service';
import { MutualPromotionFoldersController } from './mutual-promotion-folders.controller';
import { MutualPromotionLifecycleService } from './mutual-promotion-lifecycle.service';
import { MutualPromotionReadService } from './mutual-promotion-read.service';
import { MutualPromotionStatisticsService } from './mutual-promotion-statistics.service';
import { MutualPromotionValidationService } from './mutual-promotion-validation.service';

@Module({
  imports: [FinanceCategoriesModule, TelegramChannelsModule],
  controllers: [MutualPromotionFoldersController],
  providers: [
    MutualPromotionActivationService,
    MutualPromotionBoundaryService,
    MutualPromotionCommandService,
    MutualPromotionExpenseService,
    MutualPromotionLifecycleService,
    MutualPromotionReadService,
    MutualPromotionStatisticsService,
    MutualPromotionValidationService,
  ],
  exports: [MutualPromotionLifecycleService, MutualPromotionReadService],
})
export class MutualPromotionFoldersModule {}
