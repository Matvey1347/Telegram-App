import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import {
  TelegramAdCrmDealStage,
  TelegramAdPricingMode,
  TelegramAdPlacementStatus,
  TelegramAdSaleOrigin,
  TelegramAdSaleStatus,
} from '@prisma/client';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { normalizeCurrency } from './telegram-ad-sales-dto-currency';

export class CreateTelegramAdSaleDto {
  @IsOptional() @IsString() advertiserId?: string | null;
  @IsString() advertiserName!: string;
  @IsOptional() @IsString() advertiserTelegram?: string | null;
  @IsOptional() @IsString() advertiserContact?: string | null;
  @IsOptional() @IsString() advertiserCompanyName?: string | null;
  @IsOptional() @IsString() title?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsEnum(TelegramAdSaleOrigin) origin?: TelegramAdSaleOrigin;
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  settlementCurrency!: string;
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsString() sellerMemberId?: string | null;
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  reservedUntil?: string | null;
  @IsOptional()
  @IsEnum(TelegramAdCrmDealStage)
  crmDealStage?: TelegramAdCrmDealStage;
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  expectedCloseAt?: string | null;
  @IsOptional() @IsString() lostReason?: string | null;
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  nextActionAt?: string | null;
  @IsOptional() @IsBoolean() createAdvertiser?: boolean;
  @IsOptional() @IsString() sourceTaskId?: string | null;
  @IsOptional() @IsString() sourceAdvertiserActivityId?: string | null;
}

export class SaveTelegramAdSaleDraftDto {
  @IsOptional() @IsString() @MaxLength(160) title?: string | null;
  @IsObject() payload!: Record<string, unknown>;
}

export class UpdateTelegramAdSaleDto {
  @IsOptional() @IsString() advertiserId?: string | null;
  @IsOptional() @IsString() advertiserName?: string;
  @IsOptional() @IsString() advertiserTelegram?: string | null;
  @IsOptional() @IsString() advertiserContact?: string | null;
  @IsOptional() @IsString() advertiserCompanyName?: string | null;
  @IsOptional() @IsString() title?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsEnum(TelegramAdSaleOrigin) origin?: TelegramAdSaleOrigin;
  @IsOptional()
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  settlementCurrency?: string;
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsString() sellerMemberId?: string | null;
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  reservedUntil?: string | null;
  @IsOptional() @IsEnum(TelegramAdSaleStatus) status?: TelegramAdSaleStatus;
  @IsOptional()
  @IsEnum(TelegramAdCrmDealStage)
  crmDealStage?: TelegramAdCrmDealStage;
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  expectedCloseAt?: string | null;
  @IsOptional() @IsString() lostReason?: string | null;
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  nextActionAt?: string | null;
  @IsOptional() @IsString() sourceTaskId?: string | null;
  @IsOptional() @IsString() sourceAdvertiserActivityId?: string | null;
}

export class CreateTelegramAdSalePlacementDto {
  @IsString() telegramChannelId!: string;
  @IsOptional() @IsString() telegramChannelNetworkId?: string | null;
  @IsOptional() @IsString() telegramAdProductId?: string | null;
  @IsOptional() @IsString() inventoryOpportunityKey?: string | null;
  @IsOptional() @IsString() pricingSnapshotId?: string | null;
  @IsDateString() scheduledAt!: string;
  @IsString() timezone!: string;
  @IsOptional()
  @IsEnum(TelegramAdPricingMode)
  pricingMode?: TelegramAdPricingMode;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quotedCpm?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) agreedPrice?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) expectedViews?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) recommendedPrice?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumPrice?:
    | number
    | null;
  @IsOptional()
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @IsOptional() @IsString() manualPriceReason?: string | null;
}

export class UpdateTelegramAdSalePlacementDto {
  @IsOptional()
  @IsIn([TelegramAdPlacementStatus.MISSED])
  status?: TelegramAdPlacementStatus;
  @IsOptional() @IsString() telegramAdProductId?: string | null;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional()
  @IsEnum(TelegramAdPricingMode)
  pricingMode?: TelegramAdPricingMode;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) agreedPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) expectedViews?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  recommendedPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quotedCpm?:
    | number
    | null;
  @IsOptional()
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @IsOptional() @IsString() manualPriceReason?: string | null;
  @IsOptional() @IsString() managedPostId?: string | null;
  @IsOptional() @IsString() telegramPostId?: string | null;
}

export class CreateTelegramAdSalePaymentAllocationDto {
  @IsString() placementId!: string;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
}

export class CreateTelegramAdSalePaymentDto {
  @IsString() accountId!: string;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
  @IsDateString() paidAt!: string;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsString() idempotencyKey?: string | null;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTelegramAdSalePaymentAllocationDto)
  allocations!: CreateTelegramAdSalePaymentAllocationDto[];
}

export class DeleteTelegramAdSalePaymentQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  clearDealAmount?: boolean;
}

export class CreateTelegramAdSaleCheckoutPaymentDto {
  @IsString() accountId!: string;
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
  @IsDateString() paidAt!: string;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsString() idempotencyKey?: string | null;
}

export class CreateTelegramAdSaleCheckoutPlacementDto extends CreateTelegramAdSalePlacementDto {
  @Type(() => Number) @IsNumber() @Min(0) declare agreedPrice: number;
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  declare currency: string;
  @IsOptional() @IsString() telegramPostId?: string | null;
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CreatePlacementManagedPostDto)
  managedPostDraft?: CreatePlacementManagedPostDto | null;
}

export class TelegramAdSaleEditWorkflowPlacementDto {
  @IsString() id!: string;
  @IsDateString() scheduledAt!: string;
  @IsString() timezone!: string;
  @Type(() => Number) @IsNumber() @Min(0) agreedPrice!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) recommendedPrice?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumPrice?:
    | number
    | null;
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
  @IsOptional() @IsString() manualPriceReason?: string | null;
  @IsOptional() @IsString() telegramAdProductId?: string | null;
  @IsOptional() @IsString() managedPostId?: string | null;
  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePlacementManagedPostDto)
  managedPostDraft?: CreatePlacementManagedPostDto | null;
  @IsOptional()
  @ValidateNested()
  @Type(() => AttachPlacementManagedPostDto)
  postAttachment?: AttachPlacementManagedPostDto | null;
}

export class TelegramAdSaleEditWorkflowPaymentDto {
  @IsString() id!: string;
  @IsString() accountId!: string;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
  @IsDateString() paidAt!: string;
  @IsOptional() @IsString() notes?: string | null;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTelegramAdSalePaymentAllocationDto)
  allocations!: CreateTelegramAdSalePaymentAllocationDto[];
}

export class TelegramAdSaleEditWorkflowDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateTelegramAdSaleDto)
  sale?: UpdateTelegramAdSaleDto;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TelegramAdSaleEditWorkflowPlacementDto)
  placements!: TelegramAdSaleEditWorkflowPlacementDto[];
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TelegramAdSaleEditWorkflowPaymentDto)
  payments!: TelegramAdSaleEditWorkflowPaymentDto[];
}

export class TelegramAdSaleCheckoutPriceAllocationDto {
  @IsIn(['PROPORTIONAL_BY_AUDIENCE'])
  mode!: 'PROPORTIONAL_BY_AUDIENCE';

  @Type(() => Number) @IsNumber() @Min(0.01) totalAmount!: number;
}

export class CreateTelegramAdSaleCheckoutDto extends CreateTelegramAdSaleDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateTelegramAdSaleCheckoutPlacementDto)
  placements!: CreateTelegramAdSaleCheckoutPlacementDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramAdSaleCheckoutPriceAllocationDto)
  priceAllocation?: TelegramAdSaleCheckoutPriceAllocationDto;

  @IsOptional()
  @IsBoolean()
  financeSkipped?: boolean;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ValidateIf((dto: CreateTelegramAdSaleCheckoutDto) => !dto.financeSkipped)
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateTelegramAdSaleCheckoutPaymentDto)
  payment!: CreateTelegramAdSaleCheckoutPaymentDto;
}

export class UpdateTelegramAdSalePaymentDto {
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional()
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTelegramAdSalePaymentAllocationDto)
  allocations?: CreateTelegramAdSalePaymentAllocationDto[];
}

export class VoidTelegramAdSalePaymentDto {
  @IsString() reason!: string;
}

export class CreatePlacementManagedPostDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() text?: string | null;
  // System Bot imports retain the original rendered content beside `text` for
  // preview fidelity. Managed posts publish `text`, but checkout must accept
  // these optional import fields rather than rejecting the entire sale.
  @IsOptional() @IsString() plainText?: string | null;
  @IsOptional() @IsString() formattedHtml?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) imageUrls?: string[];
  @IsOptional() @Allow() mediaItems?: unknown[];
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsString() icon?: string | null;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TelegramAdSalesManagedPostButtonDto)
  buttonRows?: TelegramAdSalesManagedPostButtonDto[][];
}

class TelegramAdSalesManagedPostButtonDto {
  @IsString() text!: string;
  @IsString() @Matches(/^(https?|tg):\/\//i) url!: string;
  @IsIn(['default', 'primary', 'success', 'danger']) style!:
    | 'default'
    | 'primary'
    | 'success'
    | 'danger';
}

export class AttachPlacementManagedPostDto {
  @IsOptional() @IsString() managedPostId?: string;
  @IsOptional() @IsString() telegramPostId?: string;
  @IsOptional() @IsString() telegramPostUrl?: string;
}

export class SchedulePlacementDto {
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional()
  @IsIn(['IMAGES_THEN_TEXT', 'CAPTION_THEN_TEXT'])
  longTextMode?: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT';
}

export class ScheduleSaleDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleSalePlacementItemDto)
  placements?: ScheduleSalePlacementItemDto[];
}

export class ScheduleSalePlacementItemDto {
  @IsString() placementId!: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional()
  @IsIn(['IMAGES_THEN_TEXT', 'CAPTION_THEN_TEXT'])
  longTextMode?: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT';
}

export class PublishPlacementDto {
  @IsOptional()
  @IsIn(['IMAGES_THEN_TEXT', 'CAPTION_THEN_TEXT'])
  longTextMode?: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT';
}

export class ReschedulePlacementDto {
  @IsDateString() scheduledAt!: string;
  @IsOptional()
  @IsIn(['IMAGES_THEN_TEXT', 'CAPTION_THEN_TEXT'])
  longTextMode?: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT';
}

export class CancelPlacementDto {
  @IsOptional() @IsString() reason?: string | null;
}

export class RetryPlacementDeletionDto {
  @IsOptional() @IsString() reason?: string | null;
}

export class CompletePermanentPlacementDto {
  @IsOptional() @IsString() reason?: string | null;
}

export class ReserveTelegramAdSaleDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReserveTelegramAdSalePlacementDto)
  placements?: ReserveTelegramAdSalePlacementDto[];
}

export class ReserveTelegramAdSalePlacementDto {
  @IsString() placementId!: string;
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  scheduledAt?: string;
}
