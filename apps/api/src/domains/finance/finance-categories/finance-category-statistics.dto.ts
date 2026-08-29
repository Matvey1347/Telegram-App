import { TransactionType } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class FinanceCategoryStatisticsQueryDto {
  @IsEnum(TransactionType)
  type!: TransactionType;
}
