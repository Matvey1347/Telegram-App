import { CurrencyDisplayMode } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

const normalizeCurrency = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class UpdateCurrencySettingsDto {
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  primaryCurrency!: string;

  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  secondaryCurrency!: string;

  @IsOptional()
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  tertiaryCurrency?: string;

  @IsOptional()
  @IsEnum(CurrencyDisplayMode)
  currencyDisplayMode?: CurrencyDisplayMode;
}
