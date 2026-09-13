import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class SettleCommissionDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class DistributeReinvestmentDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;
}

export class WithdrawReinvestmentDto extends SettleCommissionDto {
  @IsString()
  declare accountId: string;
}
