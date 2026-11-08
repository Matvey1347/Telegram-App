import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
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

class SaveTelegramAiPostingDto {
  @IsObject() configuration!: Record<string, unknown>;
  @IsOptional() @IsBoolean() autopilotEnabled?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(20) postsPerDay?: number;
  @IsOptional() @IsInt() @Min(0) @Max(500) targetReadyDrafts?: number;
  @IsOptional() @IsInt() @Min(1) @Max(500) maxReadyDrafts?: number;
  @IsOptional() @IsInt() @Min(1) @Max(62) targetCoverageDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(62) criticalCoverageDays?: number;
  @IsOptional() @Matches(/^(0|[1-9]\d{0,6})(\.\d{1,12})?$/) aiDailyBudget?:
    | string
    | null;
  @IsOptional() @Matches(/^(0|[1-9]\d{0,6})(\.\d{1,12})?$/) aiMonthlyBudget?:
    | string
    | null;
}
class AutopilotSettingsDto {
  @IsOptional() @IsInt() @Min(1) @Max(20) postsPerDay?: number;
  @IsOptional() @IsInt() @Min(0) @Max(500) targetReadyDrafts?: number;
  @IsOptional() @IsInt() @Min(1) @Max(500) maxReadyDrafts?: number;
  @IsOptional() @IsInt() @Min(1) @Max(62) targetCoverageDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(62) criticalCoverageDays?: number;
}
class CheckTelegramAiPostingSourceDto {
  @IsString() sourceId!: string;
}
class GenerateTelegramAiPostingDto {
  @IsInt() @Min(1) @Max(5) count!: number;
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
  ) {}
  @Get() get(@CurrentUser() user: JwtUser, @Param('channelId') id: string) {
    return this.service.get(user.sub, id);
  }
  @Get('analytics') analyticsForChannel(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
    @Query() query: TelegramAiPostingAnalyticsQueryDto,
  ) {
    return this.analytics.read(user.sub, id, query);
  }
  @Get('source-channels') sourceChannels(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
  ) {
    return this.service.sourceChannels(user.sub, id);
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
  @Get('test-runs') runs(
    @CurrentUser() user: JwtUser,
    @Param('channelId') id: string,
  ) {
    return this.testRuns.listRuns(user.sub, id);
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
    return this.service.checkSource(user.sub, id, dto.sourceId);
  }
}
