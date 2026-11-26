import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

export class AdCampaignInviteWindowDto {
  @IsString() inviteLinkId!: string;
  @IsOptional() @IsBoolean() currentRequests?: boolean;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) fromDate?: string | null;
}

export class SetAdCampaignInviteWindowsDto {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true })
  @Type(() => AdCampaignInviteWindowDto)
  windows!: AdCampaignInviteWindowDto[];
}
