import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';
import type { CrmChatActionRequest } from '@telegram-system/shared';
export class CrmReactionAssetsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  messageIds!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Matches(/^\d{1,20}$/, { each: true })
  documentIds?: string[];
}
export class CrmChatActionDto implements CrmChatActionRequest {
  @IsString() @MaxLength(80) operationId!: string;
  @IsIn(['EDIT', 'DELETE', 'REACTION', 'FORWARD'])
  kind!: CrmChatActionRequest['kind'];
  @IsString() @MaxLength(100) messageId!: string;
  @IsOptional() @IsString() @MaxLength(4096) text?: string;
  @IsOptional() @IsBoolean() revoke?: boolean;
  @IsOptional() @IsString() @MaxLength(40) emoji?: string | null;
  @IsOptional() @IsString() @MaxLength(100) destinationConversationId?: string;
}
export class CrmChatMediaDto {
  @IsString() @MaxLength(80) operationId!: string;
  @IsIn(['IMAGE', 'FILE', 'VOICE']) kind!: 'IMAGE' | 'FILE' | 'VOICE';
  @IsOptional() @IsString() @MaxLength(1024) caption?: string;
  @IsOptional() @IsString() @MaxLength(100) replyToMessageId?: string;
}
