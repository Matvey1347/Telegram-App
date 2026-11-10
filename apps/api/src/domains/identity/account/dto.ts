import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { APP_LOCALES, type AppLocale } from '@telegram-system/shared';

export class UpdateMeDto {
  @IsOptional()
  @IsIn(APP_LOCALES)
  locale?: AppLocale;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  avatarIconId?: string | null;

  @IsOptional()
  @IsString()
  telegramUsername?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  telegramUserAccountIds?: string[];

  @IsOptional()
  @IsObject()
  editorShortcuts?: Record<string, string>;
}

export class UpdateLocaleDto {
  @IsIn(APP_LOCALES)
  locale!: AppLocale;
}

export class UpdatePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class UpdateWorkspaceDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  avatarIconId?: string | null;
}
