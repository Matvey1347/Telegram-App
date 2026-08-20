import { IsArray, IsIn, IsString, ValidateIf } from 'class-validator';

export class ImportTelegramCustomEmojiPackDto {
  @IsString() source!: string;
  @IsIn(['CHANNELS', 'ALL_CHANNELS']) scope!: 'CHANNELS' | 'ALL_CHANNELS';
  @ValidateIf((dto) => dto.scope === 'CHANNELS')
  @IsArray()
  @IsString({ each: true })
  channelIds?: string[];
}

export class AttachTelegramCustomEmojiPackDto {
  @IsIn(['CHANNELS', 'ALL_CHANNELS']) scope!: 'CHANNELS' | 'ALL_CHANNELS';
  @ValidateIf((dto) => dto.scope === 'CHANNELS')
  @IsArray()
  @IsString({ each: true })
  channelIds?: string[];
}
