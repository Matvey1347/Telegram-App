import { Type } from 'class-transformer';
import { IsBoolean, IsDefined, ValidateNested } from 'class-validator';

export class TelegramWorkspaceSyncSelectionDto {
  @IsBoolean() syncIncludePublicInfo!: boolean;
  @IsBoolean() syncIncludeInviteLinks!: boolean;
  @IsBoolean() syncIncludeHistoricalPosts!: boolean;
  @IsBoolean() syncIncludePostMetrics!: boolean;
  @IsBoolean() syncIncludeOlderPosts!: boolean;
  @IsBoolean() syncIncludeChannelStats!: boolean;
  @IsBoolean() syncIncludeManagedPosts!: boolean;
  @IsBoolean() syncIncludeAudienceSnapshot!: boolean;
}

export class TelegramWorkspaceManualSyncDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => TelegramWorkspaceSyncSelectionDto)
  selection!: TelegramWorkspaceSyncSelectionDto;
}
