import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CRM_CONTACT_STAGES,
  CRM_MESSAGE_DIRECTIONS,
  CRM_MESSAGE_ORIGINS,
  type CrmContactStage,
  type CrmMessageDirection,
  type CrmMessageOrigin,
} from '@telegram-system/shared';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

const trimNullable = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CrmContactsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(CRM_CONTACT_STAGES) stage?: CrmContactStage;
  @IsOptional() @IsString() ownerMemberId?: string;
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true'
      ? true
      : value === false || value === 'false'
        ? false
        : value,
  )
  @IsBoolean()
  archived?: boolean;
}

export class CreateCrmContactDto {
  @IsString() @MaxLength(160) displayName!: string;
  @IsOptional()
  @Transform(trimNullable)
  @IsString()
  @MaxLength(160)
  companyName?: string | null;
  @IsOptional()
  @Transform(trimNullable)
  @IsString()
  @MaxLength(64)
  telegramUsername?: string | null;
  @IsOptional() @Transform(trimNullable) @IsString() @MaxLength(64) phone?:
    | string
    | null;
  @IsOptional() @Transform(trimNullable) @IsString() @MaxLength(320) email?:
    | string
    | null;
  @IsOptional() @Transform(trimNullable) @IsString() @MaxLength(500) website?:
    | string
    | null;
  @IsOptional()
  @Transform(trimNullable)
  @IsString()
  @MaxLength(4_000)
  description?: string | null;
  @IsOptional() @Transform(trimNullable) @IsString() @MaxLength(160) source?:
    | string
    | null;
  @IsOptional() @IsIn(CRM_CONTACT_STAGES) stage?: CrmContactStage;
  @IsOptional() @IsString() ownerMemberId?: string | null;
  @IsOptional() @IsDateString() nextContactAt?: string | null;
}

export class UpdateCrmContactDto {
  @IsOptional() @IsString() @MaxLength(160) displayName?: string;
  @IsOptional()
  @Transform(trimNullable)
  @IsString()
  @MaxLength(160)
  companyName?: string | null;
  @IsOptional()
  @Transform(trimNullable)
  @IsString()
  @MaxLength(64)
  telegramUsername?: string | null;
  @IsOptional() @Transform(trimNullable) @IsString() @MaxLength(64) phone?:
    | string
    | null;
  @IsOptional() @Transform(trimNullable) @IsString() @MaxLength(320) email?:
    | string
    | null;
  @IsOptional() @Transform(trimNullable) @IsString() @MaxLength(500) website?:
    | string
    | null;
  @IsOptional()
  @Transform(trimNullable)
  @IsString()
  @MaxLength(4_000)
  description?: string | null;
  @IsOptional() @Transform(trimNullable) @IsString() @MaxLength(160) source?:
    | string
    | null;
  @IsOptional() @IsIn(CRM_CONTACT_STAGES) stage?: CrmContactStage;
  @IsOptional() @IsString() ownerMemberId?: string | null;
  @IsOptional() @IsDateString() nextContactAt?: string | null;
  @IsOptional() @IsBoolean() automatedMessagesEnabled?: boolean;
}

export class UpsertCrmPeerDto {
  @IsString() @Matches(/^\d+$/) telegramUserId!: string;
  @IsOptional() @Transform(trimNullable) @IsString() @MaxLength(64) username?:
    | string
    | null;
  @IsOptional()
  @Transform(trimNullable)
  @IsString()
  @MaxLength(160)
  firstName?: string | null;
  @IsOptional() @Transform(trimNullable) @IsString() @MaxLength(160) lastName?:
    | string
    | null;
  @IsOptional()
  @Transform(trimNullable)
  @IsString()
  @MaxLength(2_000)
  photoUrl?: string | null;
  @IsOptional() @IsString() contactId?: string | null;
}

export class CreateCrmConversationDto {
  @IsString() telegramCrmPeerId!: string;
  @IsOptional() @IsString() contactId?: string | null;
  @IsOptional() @IsString() accountId?: string;
  @IsString() @MaxLength(128) telegramDialogId!: string;
}

export class CrmConversationsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() telegramCrmPeerId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'ARCHIVED']) state?: 'ACTIVE' | 'ARCHIVED';
}

export class CrmMessagesQueryDto extends PaginationQueryDto {}

export class UpdateCrmWorkspaceSettingsDto {
  @IsOptional() @IsString() defaultCrmSenderAccountId?: string | null;
  @IsOptional() @IsBoolean() customerTelegramAutomationsEnabled?: boolean;
  @IsOptional() @IsBoolean() prePublicationReminderEnabled?: boolean;
  @IsOptional() @IsBoolean() publishedLinksEnabled?: boolean;
  @IsOptional() @IsBoolean() followUpEnabled?: boolean;
}

export class UpdateCrmAccountCapabilitiesDto {
  @IsOptional() @IsBoolean() crmSyncEnabled?: boolean;
  @IsOptional() @IsBoolean() crmSendEnabled?: boolean;
  @IsOptional() @IsBoolean() mtprotoPublishingEnabled?: boolean;
}

/** Internal-only input used by sync/sending adapters in later stages. */
export class StoreCrmMessageInput {
  @IsString() workspaceId!: string;
  @IsString() conversationId!: string;
  @IsString() mtprotoAccountId!: string;
  @IsString() telegramMessageId!: string;
  @IsIn(CRM_MESSAGE_DIRECTIONS) direction!: CrmMessageDirection;
  @IsIn(CRM_MESSAGE_ORIGINS) origin!: CrmMessageOrigin;
  @IsOptional() @IsString() sentByMemberId?: string | null;
  @IsOptional() @IsString() automationExecutionId?: string | null;
  @IsOptional() @IsString() @MaxLength(100_000) text?: string | null;
  @IsOptional() @IsObject() contentMetadata?: Record<string, unknown> | null;
  @IsDateString() sentAt!: string;
  @IsOptional() @IsDateString() editedAt?: string | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  unreadDelta?: number;
}
