import { IsBoolean, IsIn, IsString, MinLength } from 'class-validator';

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
