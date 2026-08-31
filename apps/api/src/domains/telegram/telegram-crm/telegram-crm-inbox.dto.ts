import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
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

export class SendCrmManualMessageDto {
  @IsString()
  @MaxLength(4096)
  text!: string;

  @IsString()
  @MaxLength(128)
  clientIdempotencyKey!: string;
}

export class ImportCrmHistoryDto {
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
