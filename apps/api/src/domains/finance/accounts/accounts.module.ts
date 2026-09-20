import { Module } from '@nestjs/common';
import { FinanceCategoriesModule } from '../finance-categories/finance-categories.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  imports: [FinanceCategoriesModule],
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
