import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsString,
} from 'class-validator';
import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser, type JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramAiPostingPerformanceService } from './telegram-ai-posting-performance.service';

class ClassifyTelegramAiPostingPerformanceDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  telegramPostIds!: string[];

  @IsIn(['AD', 'MUTUAL_PROMO', 'EXCLUDED', null])
  classification!: 'AD' | 'MUTUAL_PROMO' | 'EXCLUDED' | null;
}

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels/:id/ai-posting/performance')
export class TelegramAiPostingPerformanceControlController {
  constructor(private readonly performance: TelegramAiPostingPerformanceService) {}

  @Put('classification')
  classify(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: ClassifyTelegramAiPostingPerformanceDto,
  ) {
    return this.performance.classifyPosts(
      user.sub,
      id,
      dto.telegramPostIds,
      dto.classification,
    );
  }
}
