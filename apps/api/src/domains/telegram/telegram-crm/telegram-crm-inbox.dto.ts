import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  CRM_CONVERSATION_STATES,
  CRM_INBOX_PROMOTION_STAGES,
  type CrmConversationState,
  type CrmInboxPromotionStage,
} from '@telegram-system/shared';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class CrmInboxQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(CRM_CONVERSATION_STATES)
  state?: CrmConversationState;
}

export class PromoteCrmInboxPeerDto {
  @IsIn(CRM_INBOX_PROMOTION_STAGES)
  stage!: CrmInboxPromotionStage;
}

export class SetCrmInboxStateDto {
  @IsIn(CRM_CONVERSATION_STATES)
  state!: CrmConversationState;
}

export class MergeCrmContactsDto {
  @IsString()
  sourceContactId!: string;
}

/** Omitted for a manual read; automatic reads must use the displayed watermark. */
export class MarkCrmConversationReadDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  maxTelegramMessageId?: number;
}

export class SendCrmManualMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  replyToMessageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  aiDraftId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  aiDraftRevision?: number;

  @IsString()
  @MaxLength(4096)
  text!: string;

  @IsString()
  @MaxLength(128)
  clientIdempotencyKey!: string;
}

export class ImportCrmHistoryDto {
  @IsOptional()
  @IsBoolean()
  recent?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  beforeTelegramMessageId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
