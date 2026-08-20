import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateGreeterConfigDto {
  @IsOptional() captchaEnabled?: boolean;
  @IsOptional() @IsIn(['BUTTON_CONFIRM', 'SIMPLE_CHOICE']) captchaType?:
    | 'BUTTON_CONFIRM'
    | 'SIMPLE_CHOICE';
  @IsOptional() @IsString() captchaMessage?: string;
  @IsOptional() @IsString() confirmButtonText?: string;
  @IsOptional() @IsString() choicePrompt?: string;
  @IsOptional() timeoutMinutes?: number;
  @IsOptional() @IsString() successMessage?: string | null;
  @IsOptional() @IsString() failureMessage?: string | null;
  @IsOptional() @IsIn(['KEEP_PENDING', 'DECLINE']) failureBehavior?:
    | 'KEEP_PENDING'
    | 'DECLINE';
}

export class ConnectGreeterChannelDto {
  @IsString() channelId!: string;
}

export class CreateTelegramBotDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsIn(['LOCAL', 'PRODUCTION']) environment?:
    | 'LOCAL'
    | 'PRODUCTION';
  @IsString() @MinLength(10) botToken!: string;
}

export class UpdateTelegramBotDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsString() label?: string;
}

export class UpsertTelegramBotRuntimeDto {
  @IsString() @MinLength(10) botToken!: string;
}

export class SwitchTelegramBotApplicationDto {
  @IsIn(['NONE', 'GREETER', 'FINANCE'])
  applicationType!: 'NONE' | 'GREETER' | 'FINANCE';
}

export class ImportTelegramChannelsDto {
  @IsArray() @IsString({ each: true }) channels!: string[];
}
