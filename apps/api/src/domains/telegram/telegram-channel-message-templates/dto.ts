import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export class TelegramChannelMessageTemplatePayloadDto {
  @IsOptional() @IsString() @MaxLength(160) title?: string | null;
  @IsOptional() @IsString() iconId?: string | null;
  @IsIn(['CHANNELS', 'NETWORK']) scopeMode!: 'CHANNELS' | 'NETWORK';
  @IsOptional() @IsString() networkId?: string | null;
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  channelIds!: string[];
  @IsString() @MaxLength(20_000) bodyTemplate!: string;
  @IsBoolean() overrideInviteLinks!: boolean;
  @IsObject() inviteLinkOverrides!: Record<string, string>;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  excludedProductNames?: string[];
  @IsOptional()
  @IsIn(['NONE', 'NEAREST_5', 'NEAREST_10'])
  priceRounding?: 'NONE' | 'NEAREST_5' | 'NEAREST_10';
  @IsOptional() @IsObject() productNameOverrides?: Record<string, string>;
  @IsOptional() @IsBoolean() bundleOfferEnabled?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  bundleDiscountPercent?: number;
  @IsOptional() @IsObject() bundleBasePriceOverrides?: Record<string, string>;
}

export class TelegramMessageTemplateSourceDto {
  @Transform(({ value }: TransformFnParams) => {
    const input: unknown = value;
    return Array.isArray(input)
      ? input.map((item) => String(item || '').trim()).filter(Boolean)
      : input;
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  channelIds?: string[];
  @IsOptional() @IsString() templateId?: string;
}
