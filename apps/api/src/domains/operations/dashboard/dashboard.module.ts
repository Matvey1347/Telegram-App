import { Module } from '@nestjs/common';
import { TelegramChannelsModule } from '../../telegram/telegram-channels/telegram-channels.module';
import { DashboardInsightsReadService } from './dashboard-insights-read.service';
import { DashboardController } from './dashboard.controller';
import { DashboardReadService } from './dashboard-read.service';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TelegramChannelsModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardReadService,
    DashboardInsightsReadService,
  ],
})
export class DashboardModule {}
