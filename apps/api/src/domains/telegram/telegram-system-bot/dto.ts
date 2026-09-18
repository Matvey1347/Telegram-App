import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { TelegramSystemBotPostImportMode } from '@telegram-system/shared';

export class UpdateTelegramSystemBotSubscriptionDto {
  @IsString()
  @MinLength(1)
  workspaceId!: string;

  @IsString()
  @MinLength(1)
  taskKey!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  notifyOnSuccess!: boolean;

  @IsBoolean()
  notifyOnFailure!: boolean;
}

export class TelegramSystemBotSubscriptionsQueryDto {
  @IsString()
  @MinLength(1)
  workspaceId!: string;
}

export class UpdateTelegramSystemBotGroupSubscriptionsDto {
  @IsString()
  @MinLength(1)
  workspaceId!: string;

  @IsIn(['TELEGRAM'])
  groupKey!: 'TELEGRAM';

  @IsBoolean()
  notifyOnSuccess!: boolean;

  @IsBoolean()
  notifyOnFailure!: boolean;
}

export class PrepareTelegramSystemBotPostImportDto {
  @IsIn(['single', 'multiple'])
  mode!: TelegramSystemBotPostImportMode;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  context?: string;

  @IsOptional()
  @IsBoolean()
  replaceActive?: boolean;
}
