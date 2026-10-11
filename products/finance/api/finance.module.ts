import { Module } from '@nestjs/common';
import { SimpleFinanceController } from './finance.controller';
import { SimpleFinanceService } from './finance.service';
@Module({ controllers:[SimpleFinanceController], providers:[SimpleFinanceService], exports:[SimpleFinanceService] })
export class SimpleFinanceModule {}
