import { Transform, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
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
}

export class TelegramMessageTemplateSourceDto {
  @Transform(({ value }: TransformFnParams) => {
    const input: unknown = value;
    return Array.isArray(input)
      ? input.map((item) => String(item || '').trim()).filter(Boolean)
      : input;
  })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  channelIds!: string[];
}
