import { Module } from '@nestjs/common';
import { CrossPromotionPlansController } from './cross-promotion-plans.controller';
import { CrossPromotionPlansService } from './cross-promotion-plans.service';
import { CrossPromotionPlanReadService } from './cross-promotion-plan-read.service';
import { CrossPromotionPlanSchedulingService } from './cross-promotion-plan-scheduling.service';
import { TelegramChannelsModule } from '../../telegram/telegram-channels/telegram-channels.module';

@Module({
  imports: [TelegramChannelsModule],
  controllers: [CrossPromotionPlansController],
  providers: [
    CrossPromotionPlansService,
    CrossPromotionPlanReadService,
    CrossPromotionPlanSchedulingService,
  ],
})
export class CrossPromotionPlansModule {}
