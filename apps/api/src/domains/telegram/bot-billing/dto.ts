import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpsertBillingProviderConfigDto {
  @IsOptional() @IsString() secretKey?: string;
  @IsOptional() @IsString() webhookSecret?: string;
  @IsOptional() @IsString() publicKey?: string;
}

export class CreateBillingPlanDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() description?: string;
}

export class CreateBillingPlanPriceDto {
  @IsString() @MinLength(3) currency!: string;
  @IsIn(['MONTH', 'YEAR']) interval!: 'MONTH' | 'YEAR';
  @Type(() => Number) @IsInt() @Min(1) amountMinor!: number;
}

export class SetBillingPriceVisibilityDto {
  @IsBoolean() isPublic!: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateBillingGrantDto {
  @IsString() telegramBotUserId!: string;
  @IsString() planId!: string;
  @IsIn(['MANUAL', 'GIFT']) source!: 'MANUAL' | 'GIFT';
  @IsString() @MinLength(1) reason!: string;
  @IsString() @MinLength(8) idempotencyKey!: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class RevokeBillingGrantDto {
  @IsString() @MinLength(1) reason!: string;
}

export class CreateStripeCheckoutDto {
  @IsString() priceId!: string;
  @IsOptional() @IsIn(['TEST', 'LIVE']) mode?: 'TEST' | 'LIVE';
  @IsOptional() @IsString() couponCode?: string;
}

export class CreateBillingCouponDto {
  @IsString() @MinLength(1) code!: string;
  @IsOptional() @IsString() planId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) percentOff?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) amountOffMinor?: number;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3) currency?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxRedemptions?: number;
  @IsOptional() @IsBoolean() newUsersOnly?: boolean;
}

export class BillingSubscribersQueryDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'INCOMPLETE']) status?: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED' | 'INCOMPLETE';
  @IsOptional() @IsIn(['STRIPE', 'TELEGRAM_STARS', 'MANUAL', 'GIFT']) source?: 'STRIPE' | 'TELEGRAM_STARS' | 'MANUAL' | 'GIFT';
  @IsOptional() @IsIn(['STRIPE', 'TELEGRAM_STARS']) provider?: 'STRIPE' | 'TELEGRAM_STARS';
  @IsOptional() @IsString() planId?: string;
  @IsOptional() @IsIn(['LOCAL', 'PRODUCTION']) environment?: 'LOCAL' | 'PRODUCTION';
}

export class BillingUsersQueryDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['LOCAL', 'PRODUCTION']) environment?: 'LOCAL' | 'PRODUCTION';
}

export class UpdateFinanceSupportProfileDto {
  @IsOptional() @IsIn(['uk', 'ru', 'en']) locale?: 'uk' | 'ru' | 'en';
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/u) currency?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsBoolean() resetOnboarding?: boolean;
}
