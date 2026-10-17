import {
  IsArray,
  IsIn,
  IsOptional,
  Equals,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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

export class UpdateTelegramBotRuntimeProfileDto {
  @IsOptional() @IsString() @MaxLength(64) name?: string;
  @Equals('true') confirmTelegramUpdate!: string;
}

export class SwitchTelegramBotApplicationDto {
  @IsIn(['NONE', 'FINANCE'])
  applicationType!: 'NONE' | 'FINANCE';
}

export class ImportTelegramChannelsDto {
  @IsArray() @IsString({ each: true }) channels!: string[];
}
