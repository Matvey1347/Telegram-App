import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardReadService } from './dashboard-read.service';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DashboardReadService],
})
export class DashboardModule {}
