import { MAX_TELEGRAM_AI_POSTING_BATCH_SIZE } from '@telegram-system/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import { TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH, TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES, type TelegramAiPostingReferenceAnalysisInput, type TelegramAiPostingRunAccepted } from '@telegram-system/shared';
import { TelegramAiPostingReferenceAnalysisService } from './telegram-ai-posting-reference-analysis.service';
import type { Response } from 'express';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
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

class AnalyzeReferencesDto implements TelegramAiPostingReferenceAnalysisInput {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(500) description!: string;
  @IsString() @MaxLength(TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH) generationDescription!: string;
  @IsString() @MaxLength(TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH) searchDescription!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES)
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, disallow_auth: true }, { each: true })
  references!: string[];
}

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
  @IsInt() @Min(1) @Max(MAX_TELEGRAM_AI_POSTING_BATCH_SIZE) count!: number;
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
    private readonly referenceAnalysis: TelegramAiPostingReferenceAnalysisService,
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
  @Post('media-preferences/analyze-references')
  analyzeReferences(@CurrentUser() user: JwtUser, @Param('channelId') id: string, @Body() dto: AnalyzeReferencesDto) {
    return this.referenceAnalysis.analyze(user.sub, id, dto);
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
      heartbeatIntervalMs: 15_000,
      action: (onProgress) =>
        this.generator.generate(user.sub, id, dto.count, 'MANUAL', undefined, onProgress),
    });
  }
  @Post('generate/background')
  @HttpCode(202)
  generateInBackground(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Body() dto: GenerateTelegramAiPostingDto,
  ): Promise<TelegramAiPostingRunAccepted> {
    return new Promise((resolve, reject) => {
      void this.generator
        .generate(user.sub, id, dto.count, 'MANUAL', undefined, undefined, undefined, undefined, (runId) => resolve({ runId }))
        .catch(reject);
    });
  }
  @Get('test-runs')
  @Header('Cache-Control', 'no-store')
  runs(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
  ) {
    return this.testRuns.listRuns(user.sub, id);
  }
  @Get('test-runs/:runId/progress')
  @Header('Cache-Control', 'no-store')
  runProgress(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Param('runId') runId: string,
  ) {
    return this.testRuns.readRunProgress(user.sub, id, runId);
  }
  @Delete('test-runs') clearTestRuns(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
  ) {
    return this.testRuns.clearHistory(user.sub, id);
  }
  @Post('test-runs/:runId/stop')
  @HttpCode(200)
  stopTestRun(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Param('runId') runId: string,
  ) {
    return this.testRuns.stopRun(user.sub, id, runId);
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
      heartbeatIntervalMs: 15_000,
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
