import { Module } from '@nestjs/common';
import { InvestmentsController } from './investments.controller';
import { InvestmentsService } from './investments.service';
import { FinanceCategoriesModule } from '../finance-categories/finance-categories.module';

@Module({
  imports: [FinanceCategoriesModule],
  controllers: [InvestmentsController],
  providers: [InvestmentsService],
})
export class InvestmentsModule {}
