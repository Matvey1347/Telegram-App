import { forwardRef, Module } from '@nestjs/common';
import { FinanceCategoriesModule } from '../../finance/finance-categories/finance-categories.module';
import { TelegramChannelsModule } from '../../telegram/telegram-channels/telegram-channels.module';
import { MutualPromotionCommandService } from './mutual-promotion-command.service';
import { MutualPromotionBoundaryService } from './mutual-promotion-boundary.service';
import { MutualPromotionActivationService } from './mutual-promotion-activation.service';
import { MutualPromotionAttributionHistoryService } from './mutual-promotion-attribution-history.service';
import { MutualPromotionExpenseService } from './mutual-promotion-expense.service';
import { MutualPromotionFoldersController } from './mutual-promotion-folders.controller';
import { MutualPromotionLifecycleService } from './mutual-promotion-lifecycle.service';
import { MutualPromotionInviteLinkEditService } from './mutual-promotion-invite-link-edit.service';
import { MutualPromotionInviteLinkImportService } from './mutual-promotion-invite-link-import.service';
import { MutualPromotionReadService } from './mutual-promotion-read.service';
import { MutualPromotionStatisticsService } from './mutual-promotion-statistics.service';
import { MutualPromotionValidationService } from './mutual-promotion-validation.service';
import { TelegramSystemBotModule } from '../../telegram/telegram-system-bot/telegram-system-bot.module';
import { MutualPromotionBotNotificationService } from './mutual-promotion-bot-notification.service';

@Module({
  imports: [FinanceCategoriesModule, TelegramChannelsModule, forwardRef(() => TelegramSystemBotModule)],
  controllers: [MutualPromotionFoldersController],
  providers: [
    MutualPromotionActivationService,
    MutualPromotionBotNotificationService,
    MutualPromotionAttributionHistoryService,
    MutualPromotionBoundaryService,
    MutualPromotionCommandService,
    MutualPromotionExpenseService,
    MutualPromotionInviteLinkEditService,
    MutualPromotionInviteLinkImportService,
    MutualPromotionLifecycleService,
    MutualPromotionReadService,
    MutualPromotionStatisticsService,
    MutualPromotionValidationService,
  ],
  exports: [MutualPromotionLifecycleService, MutualPromotionReadService],
})
export class MutualPromotionFoldersModule {}
