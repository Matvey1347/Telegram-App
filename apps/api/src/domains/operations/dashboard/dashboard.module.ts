import { Module } from '@nestjs/common';
import { TelegramChannelsModule } from '../../telegram/telegram-channels/telegram-channels.module';
import { DashboardInsightsReadService } from './dashboard-insights-read.service';
import { DashboardController } from './dashboard.controller';
import { DashboardReadService } from './dashboard-read.service';
import { DashboardService } from './dashboard.service';
import { MemberFinanceModule } from '../../finance/member-finance/member-finance.module';

@Module({
  imports: [TelegramChannelsModule, MemberFinanceModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardReadService,
    DashboardInsightsReadService,
  ],
})
export class DashboardModule {}
