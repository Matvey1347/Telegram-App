import { Module } from '@nestjs/common';
import { FinanceCategoriesModule } from '../finance-categories/finance-categories.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionCategoryMemberPolicyService } from './transaction-category-member-policy.service';
import { TransactionInvestmentSyncService } from './transaction-investment-sync.service';

@Module({
  imports: [FinanceCategoriesModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionCategoryMemberPolicyService,
    TransactionInvestmentSyncService,
  ],
})
export class TransactionsModule {}
