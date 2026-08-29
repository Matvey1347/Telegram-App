import { Module } from '@nestjs/common';
import { FinanceCategoriesController } from './finance-categories.controller';
import { FinanceCategoriesService } from './finance-categories.service';
import { FinanceCategoryStatisticsService } from './finance-category-statistics.service';

@Module({
  controllers: [FinanceCategoriesController],
  providers: [FinanceCategoriesService, FinanceCategoryStatisticsService],
  exports: [FinanceCategoriesService],
})
export class FinanceCategoriesModule {}
