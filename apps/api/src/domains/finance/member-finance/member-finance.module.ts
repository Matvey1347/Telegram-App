import { Module } from '@nestjs/common';
import { FinanceCategoriesModule } from '../finance-categories/finance-categories.module';
import { MemberFinanceController } from './member-finance.controller';
import { MemberFinanceService } from './member-finance.service';
import { MemberFinanceReadService } from './member-finance-read.service';

@Module({
  imports: [FinanceCategoriesModule],
  controllers: [MemberFinanceController],
  providers: [MemberFinanceReadService, MemberFinanceService],
  exports: [MemberFinanceService],
})
export class MemberFinanceModule {}
