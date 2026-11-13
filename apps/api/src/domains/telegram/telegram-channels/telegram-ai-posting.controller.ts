import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramAiPostingService } from './telegram-ai-posting.service';
import { TelegramAiPostingGeneratorService } from './telegram-ai-posting-generator.service';
import { TelegramAiPostingTestRunService } from './telegram-ai-posting-test-run.service';
import { TelegramAiPostingRuleFeedbackService } from './telegram-ai-posting-rule-feedback.service';
import { TelegramAiPostingAutopilotService } from './telegram-ai-posting-autopilot.service';
import { TelegramAiPostingAnalyticsService } from './telegram-ai-posting-analytics.service';
import { TelegramAiPostingStructureService } from './telegram-ai-posting-structure.service';
import { TelegramAiPostingSettingsVersionService } from './telegram-ai-posting-settings-version.service';
import { TelegramAiPostingPerformanceService } from './telegram-ai-posting-performance.service';
import { TelegramAiPostingFailedRetryService } from './telegram-ai-posting-failed-retry.service';
import { StreamResponseService } from '../../../common/stream/stream-response.service';

class SaveTelegramAiPostingDto {
  @IsObject() configuration!: Record<string, unknown>;
  @IsOptional() @IsBoolean() autopilotEnabled?: boolean;
  @IsOptional() @IsIn(['TEST', 'REVIEW', 'AUTOPILOT']) mode?: 'TEST' | 'REVIEW' | 'AUTOPILOT';
  @IsOptional() @IsInt() @Min(1) @Max(365) draftExpirationDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(20) postsPerDay?: number;
  @IsOptional() @IsInt() @Min(0) @Max(500) targetReadyDrafts?: number;
  @IsOptional() @IsInt() @Min(1) @Max(500) maxReadyDrafts?: number;
  @IsOptional() @IsInt() @Min(1) @Max(62) targetCoverageDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(62) criticalCoverageDays?: number;
  @IsOptional() @Matches(/^(0|[1-9]\d{0,6})(\.\d{1,12})?$/) aiMonthlyBudget?:
    | string
    | null;
}
class AutopilotSettingsDto {
  @IsOptional() @IsIn(['REVIEW', 'AUTOPILOT']) mode?: 'REVIEW' | 'AUTOPILOT';
  @IsOptional() @IsInt() @Min(1) @Max(20) postsPerDay?: number;
  @IsOptional() @IsInt() @Min(0) @Max(500) targetReadyDrafts?: number;
  @IsOptional() @IsInt() @Min(1) @Max(500) maxReadyDrafts?: number;
  @IsOptional() @IsInt() @Min(1) @Max(62) targetCoverageDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(62) criticalCoverageDays?: number;
}
class CheckTelegramAiPostingSourceDto {
  @IsString() sourceId!: string;
  @IsOptional() @IsObject() source?: Record<string, unknown>;
}
class GeneratePostingStructureDto {
  @IsString() @MaxLength(4000) description!: string;
  @IsString() @MaxLength(50) language!: string;
}
class GenerateTelegramAiPostingDto {
  @IsInt() @Min(1) @Max(5) count!: number;
}
class RegenerateFailedPublicationDto {
  @IsInt() @Min(0) failureIndex!: number;
  @IsInt() @Min(1) expectedVersion!: number;
}
class TelegramAiPostingAnalyticsQueryDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
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
class SuggestTelegramAiPostingRuleDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() feedback!: string;
}
class ConfirmTelegramAiPostingRuleDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() suggestionId!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels/:channelId/ai-posting')
export class TelegramAiPostingController {
  constructor(
    private readonly service: TelegramAiPostingService,
    private readonly generator: TelegramAiPostingGeneratorService,
    private readonly testRuns: TelegramAiPostingTestRunService,
    private readonly ruleFeedback: TelegramAiPostingRuleFeedbackService,
    private readonly autopilot: TelegramAiPostingAutopilotService,
    private readonly analytics: TelegramAiPostingAnalyticsService,
    private readonly structure: TelegramAiPostingStructureService,
    private readonly settingsVersions: TelegramAiPostingSettingsVersionService,
    private readonly performance: TelegramAiPostingPerformanceService,
    private readonly failedRetry: TelegramAiPostingFailedRetryService,
    private readonly streams: StreamResponseService,
  ) {}
  @Get() get(@CurrentUser() user: JwtUser, @Param('channelId') id: string) {
    return this.service.get(user.sub, id);
  }
  @Get('versions') versions(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
  ) {
    return this.settingsVersions.list(user.sub, id);
  }
  @Get('versions/:version') version(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.settingsVersions.get(user.sub, id, version);
  }
  @Post('versions/:version/rollback') rollbackVersion(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.settingsVersions.rollback(user.sub, id, version);
  }
  @Get('analytics') analyticsForChannel(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Query() query: TelegramAiPostingAnalyticsQueryDto,
  ) {
    return this.analytics.read(user.sub, id, query);
  }
  @Get('performance') performanceForChannel(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Query('days') days?: string,
  ) {
    const parsedDays = days === undefined ? undefined : Number(days);
    return this.performance.read(user.sub, id, parsedDays);
  }
  @Get('source-channels') sourceChannels(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
  ) {
    return this.service.sourceChannels(user.sub, id);
  }
  @Post('generate-structure') generateStructure(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Body() dto: GeneratePostingStructureDto,
  ) {
    return this.structure.generate(user.sub, id, dto.description, dto.language);
  }
  @Put() save(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Body() dto: SaveTelegramAiPostingDto,
  ) {
    return this.service.save(user.sub, id, dto);
  }
  @Post('autopilot/start') startAutopilot(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Body() dto: AutopilotSettingsDto,
  ) {
    return this.service.startAutopilot(user.sub, id, dto);
  }
  @Post('autopilot/stop') stopAutopilot(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
  ) {
    return this.service.stopAutopilot(user.sub, id);
  }
  @Get('autopilot/runs') autopilotRuns(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
  ) {
    return this.autopilot.listRuns(user.sub, id);
  }
  @Post('autopilot/runs/:runId/retry') retryAutopilotRun(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Param('runId') runId: string,
  ) {
    return this.autopilot.retryRun(user.sub, id, runId);
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
  @Post('test-runs/:runId/suggest-rule') suggestRule(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Param('runId') runId: string,
    @Body() dto: SuggestTelegramAiPostingRuleDto,
  ) {
    return this.ruleFeedback.suggestRuleChange(
      user.sub,
      id,
      runId,
      dto.expectedVersion,
      dto.feedback,
    );
  }
  @Post('test-runs/:runId/confirm-rule') confirmRule(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Param('runId') runId: string,
    @Body() dto: ConfirmTelegramAiPostingRuleDto,
  ) {
    return this.ruleFeedback.confirmRuleChange(
      user.sub,
      id,
      runId,
      dto.suggestionId,
      dto.expectedVersion,
    );
  }
  @Post('check-source') checkSource(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Body() dto: CheckTelegramAiPostingSourceDto,
  ) {
    return this.service.checkSource(user.sub, id, dto.sourceId, dto.source);
  }
}
