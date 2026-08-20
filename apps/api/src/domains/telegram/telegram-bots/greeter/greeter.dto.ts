import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class GreeterConfigDto {
  @IsBoolean() captchaEnabled!: boolean;
  @IsIn(['BUTTON_CONFIRM', 'SIMPLE_CHOICE']) captchaType!:
    | 'BUTTON_CONFIRM'
    | 'SIMPLE_CHOICE';
  @IsString() @MinLength(1) @MaxLength(4096) captchaMessage!: string;
  @IsString() @MinLength(1) @MaxLength(64) confirmButtonText!: string;
  @IsString() @MinLength(1) @MaxLength(4096) choicePrompt!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) timeoutMinutes!: number;
  @IsOptional() @IsString() @MaxLength(4096) successMessage?: string | null;
  @IsOptional() @IsString() @MaxLength(4096) failureMessage?: string | null;
  @IsIn(['KEEP_PENDING', 'DECLINE']) failureBehavior!:
    | 'KEEP_PENDING'
    | 'DECLINE';
}

export class PublishGreeterConfigDto {
  @Type(() => Number) @IsInt() @Min(1) draftRevision!: number;
}

export class ResolveGreeterTestUserDto {
  @IsString() @MinLength(1) @MaxLength(64) username!: string;
}

export class EnableGreeterTestModeDto {
  @IsString() telegramBotUserId!: string;
  @IsOptional() @IsString() channelId?: string;
}

export class GreeterChannelDto {
  @IsString() channelId!: string;
}

export class GreeterChannelOverrideDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsBoolean() useGlobalConfig!: boolean;
  @IsOptional() @IsBoolean() captchaEnabled?: boolean;
  @IsOptional() @IsIn(['BUTTON_CONFIRM', 'SIMPLE_CHOICE']) captchaType?:
    | 'BUTTON_CONFIRM'
    | 'SIMPLE_CHOICE';
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  captchaMessage?: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  confirmButtonText?: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  choicePrompt?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  timeoutMinutes?: number;
  @IsOptional() @IsString() @MaxLength(4096) successMessage?: string | null;
  @IsOptional() @IsString() @MaxLength(4096) failureMessage?: string | null;
  @IsOptional() @IsIn(['KEEP_PENDING', 'DECLINE']) failureBehavior?:
    | 'KEEP_PENDING'
    | 'DECLINE';
}

export class GreeterUsersQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsString() channelId?: string;
  @IsOptional()
  @IsIn(['PENDING', 'PASSED', 'FAILED', 'APPROVED', 'DECLINED', 'EXPIRED'])
  captchaStatus?: string;
  @IsOptional() @IsIn(['ALIVE', 'BLOCKED', 'DID_NOT_INTERACT']) state?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class GreeterAnalyticsQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() channelId?: string;
}

export class GreeterTemplatePreviewDto {
  @IsString() @MaxLength(4096) messageText!: string;
  @IsOptional() @IsArray() buttons?: unknown[];
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsString() telegramBotUserId?: string;
}

export class GreeterPreviewContextDto {
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsString() telegramBotUserId?: string;
}

export class GreeterSequenceDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsIn(['AFTER_START', 'AFTER_CAPTCHA_SUCCESS']) trigger!:
    | 'AFTER_START'
    | 'AFTER_CAPTCHA_SUCCESS';
  @IsOptional() @IsString() channelId?: string | null;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateGreeterSequenceDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsIn(['AFTER_START', 'AFTER_CAPTCHA_SUCCESS']) trigger?:
    | 'AFTER_START'
    | 'AFTER_CAPTCHA_SUCCESS';
  @IsOptional() @IsString() channelId?: string | null;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class GreeterButtonDto {
  @IsString() @MinLength(1) @MaxLength(64) text!: string;
  @IsString() @MinLength(1) @MaxLength(2048) url!: string;
}

export class GreeterSequenceStepDto {
  @Type(() => Number) @IsInt() @Min(0) position!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(31536000) delaySeconds!: number;
  @IsBoolean() enabled!: boolean;
  @IsString() @MinLength(1) @MaxLength(4096) messageText!: string;
  @IsArray() @ArrayMaxSize(8) buttons!: GreeterButtonDto[][];
}

export class ReplaceGreeterDraftDto {
  @Type(() => Number) @IsInt() @Min(1) draftRevision!: number;
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => GreeterSequenceStepDto)
  steps!: GreeterSequenceStepDto[];
}

export class PublishGreeterSequenceDto {
  @Type(() => Number) @IsInt() @Min(1) draftRevision!: number;
}

export class SelectGreeterTesterDto {
  @IsString() telegramBotUserId!: string;
  @IsString() channelId!: string;
  @IsBoolean() enabled!: boolean;
}

export class GreeterBroadcastDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @MinLength(1) @MaxLength(4096) messageText!: string;
  @IsArray() @ArrayMaxSize(8) buttons!: GreeterButtonDto[][];
  @IsIn(['ALL_ALIVE', 'CHANNEL', 'USER_STATE']) audience!:
    | 'ALL_ALIVE'
    | 'CHANNEL'
    | 'USER_STATE';
  @IsOptional() @IsString() channelId?: string | null;
  @IsOptional() @IsIn(['ALIVE', 'BLOCKED', 'DID_NOT_INTERACT']) userState?:
    | 'ALIVE'
    | 'BLOCKED'
    | 'DID_NOT_INTERACT'
    | null;
}

export class ScheduleGreeterBroadcastDto {
  @IsDateString() scheduledAt!: string;
}
