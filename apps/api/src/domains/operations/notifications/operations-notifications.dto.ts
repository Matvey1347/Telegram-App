import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OperationsNotificationsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class MarkVisibleNotificationsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  ids!: string[];
}

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  webPushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  crmNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  crmIncomingMessagesEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  crmFollowUpEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  crmAiLeadsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  crmMessagePreviewEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  channelRemindersPushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  channelRemindersTelegramEnabled?: boolean;
}

class OperationsPushKeysDto {
  @IsString()
  @MaxLength(512)
  p256dh!: string;

  @IsString()
  @MaxLength(512)
  auth!: string;
}

export class OperationsPushSubscriptionDto {
  @IsUrl({ require_protocol: true }, { message: 'endpoint must be a URL' })
  @MaxLength(4096)
  endpoint!: string;

  @ValidateNested()
  @Type(() => OperationsPushKeysDto)
  keys!: OperationsPushKeysDto;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string | null;
}

export class OperationsPushUnsubscribeDto {
  @IsUrl({ require_protocol: true }, { message: 'endpoint must be a URL' })
  @MaxLength(4096)
  endpoint!: string;
}
