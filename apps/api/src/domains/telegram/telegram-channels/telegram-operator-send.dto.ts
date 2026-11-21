import { IsIn, IsObject, IsString, Matches, MaxLength } from 'class-validator';

export const operatorBotMethods = ['sendMessage', 'sendPhoto', 'sendVideo', 'sendMediaGroup', 'sendRichMessage'] as const;

export class TelegramOperatorSendDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  @MaxLength(100)
  operationId!: string;

  @IsString()
  @Matches(/^operator:[0-9a-f-]{36}$/)
  claimOwner!: string;

  @IsIn(['mtproto', ...operatorBotMethods])
  kind!: 'mtproto' | (typeof operatorBotMethods)[number];

  @IsObject()
  payload!: Record<string, unknown>;
}
