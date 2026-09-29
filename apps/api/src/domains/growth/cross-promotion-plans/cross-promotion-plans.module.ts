import { forwardRef, Module } from '@nestjs/common';
import { CrossPromotionPlansController } from './cross-promotion-plans.controller';
import { CrossPromotionPlansService } from './cross-promotion-plans.service';
import { CrossPromotionPlanReadService } from './cross-promotion-plan-read.service';
import { CrossPromotionPlanSchedulingService } from './cross-promotion-plan-scheduling.service';
import { TelegramChannelsModule } from '../../telegram/telegram-channels/telegram-channels.module';
import { CrossPromotionPlanLifecycleService } from './cross-promotion-plan-lifecycle.service';
import { TelegramSystemBotModule } from '../../telegram/telegram-system-bot/telegram-system-bot.module';
import { CrossPromotionPlanBotNotificationService } from './cross-promotion-plan-bot-notification.service';

@Module({
  imports: [TelegramChannelsModule, forwardRef(() => TelegramSystemBotModule)],
  controllers: [CrossPromotionPlansController],
  providers: [
    CrossPromotionPlansService,
    CrossPromotionPlanReadService,
    CrossPromotionPlanSchedulingService,
    CrossPromotionPlanLifecycleService,
    CrossPromotionPlanBotNotificationService,
  ],
  exports: [CrossPromotionPlanLifecycleService],
})
export class CrossPromotionPlansModule {}
