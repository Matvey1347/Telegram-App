import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/pagination/pagination-query.dto';

export class AdHypothesisQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  telegramChannelIds?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
