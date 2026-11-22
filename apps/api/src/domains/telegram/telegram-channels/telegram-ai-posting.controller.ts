import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramAiPostingService } from './telegram-ai-posting.service';
import { TelegramAiPostingGeneratorService } from './telegram-ai-posting-generator.service';
import { TelegramAiPostingTestRunService } from './telegram-ai-posting-test-run.service';
import { TelegramAiPostingFailedRetryService } from './telegram-ai-posting-failed-retry.service';
import { StreamResponseService } from '../../../common/stream/stream-response.service';

class SaveTelegramAiPostingDto {
  @IsObject() configuration!: Record<string, unknown>;
  @IsOptional() @IsIn(['TEST', 'REVIEW']) mode?: 'TEST' | 'REVIEW';
  @IsOptional() @IsInt() @Min(1) @Max(365) draftExpirationDays?: number;
}
class ImportTelegramAiPostingSettingsDto {
  @IsInt() schemaVersion!: number;
  @IsObject() configuration!: Record<string, unknown>;
}
class GenerateTelegramAiPostingDto {
  @IsInt() @Min(1) @Max(5) count!: number;
}
class RegenerateFailedPublicationDto {
  @IsInt() @Min(0) failureIndex!: number;
  @IsInt() @Min(1) expectedVersion!: number;
}
class ReviewTelegramAiPostingDto {
  @IsInt() @Min(0) index!: number;
  @IsInt() @Min(1) expectedVersion!: number;
  @IsIn([
    'approve',
    'reject',
    'edit',
    'save',
    'regenerate-text',
    'regenerate-image',
  ])
  action!:
    | 'approve'
    | 'reject'
    | 'edit'
    | 'save'
    | 'regenerate-text'
    | 'regenerate-image';
  @IsOptional() @IsString() value?: string;
}
@UseGuards(JwtAuthGuard)
@Controller('telegram-channels/:channelId/ai-posting')
export class TelegramAiPostingController {
  constructor(
    private readonly service: TelegramAiPostingService,
    private readonly generator: TelegramAiPostingGeneratorService,
    private readonly testRuns: TelegramAiPostingTestRunService,
    private readonly failedRetry: TelegramAiPostingFailedRetryService,
    private readonly streams: StreamResponseService,
  ) {}
  @Get() get(@CurrentUser() user: JwtUser, @Param('channelId') id: string) {
    return this.service.get(user.sub, id);
  }
  @Get('content-model') contentModel(@CurrentUser() user: JwtUser, @Param('channelId') id: string) {
    return this.service.contentModelForChannel(user.sub, id);
  }
  @Get('settings/export') exportSettings(@CurrentUser() user: JwtUser, @Param('channelId') id: string) {
    return this.service.exportSettings(user.sub, id);
  }
  @Post('settings/import') importSettings(@CurrentUser() user: JwtUser, @Param('channelId') id: string, @Body() dto: ImportTelegramAiPostingSettingsDto) {
    return this.service.importSettings(user.sub, id, dto);
  }
  @Put() save(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Body() dto: SaveTelegramAiPostingDto,
  ) {
    return this.service.save(user.sub, id, dto);
  }
  @Post('generate') generate(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Body() dto: GenerateTelegramAiPostingDto,
  ) {
    return this.generator.generate(user.sub, id, dto.count);
  }
  @Post('generate/stream') generateStream(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Body() dto: GenerateTelegramAiPostingDto,
    @Res() response: Response,
  ) {
    return this.streams.stream(response, {
      eventPrefix: 'telegram_ai_posting.generate',
      action: (onProgress) =>
        this.generator.generate(user.sub, id, dto.count, 'MANUAL', undefined, onProgress),
    });
  }
  @Get('test-runs') runs(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
  ) {
    return this.testRuns.listRuns(user.sub, id);
  }
  @Delete('test-runs') clearTestRuns(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
  ) {
    return this.testRuns.clearHistory(user.sub, id);
  }
  @Post('test-runs/:runId/regenerate-failure/stream') regenerateFailure(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Param('runId') runId: string,
    @Body() dto: RegenerateFailedPublicationDto,
    @Res() response: Response,
  ) {
    return this.streams.stream(response, {
      eventPrefix: 'telegram_ai_posting.retry_failed_publication',
      action: (onProgress) =>
        this.failedRetry.regenerateFailedPublication(
          user.sub,
          id,
          runId,
          dto.failureIndex,
          dto.expectedVersion,
          onProgress,
        ),
    });
  }
  @Post('test-runs/:runId/bot-image') prepareBotImage(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Param('runId') runId: string,
    @Body() input: Parameters<TelegramAiPostingTestRunService['prepareBotImage']>[3],
  ) {
    return this.testRuns.prepareBotImage(user.sub, channelId, runId, input);
  }

  @Post('test-runs/:runId/review') review(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Param('runId') runId: string,
    @Body() dto: ReviewTelegramAiPostingDto,
  ) {
    return this.testRuns.reviewPublication(
      user.sub,
      id,
      runId,
      dto.index,
      dto.expectedVersion,
      dto.action,
      dto.value,
    );
  }
}
