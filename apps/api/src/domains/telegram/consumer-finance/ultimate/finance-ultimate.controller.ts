import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { FinanceConsumerSessionService } from './finance-consumer-session.service';
import { FinanceEntitlementService } from './finance-entitlement.service';
import type { FinanceCapability } from './finance-entitlement.service';
import { FinanceUltimateQuestionDto, FinanceUltimateQueryDto } from './finance.dto';
import { FinanceUltimateService } from './finance-ultimate.service';

/** Separate controller keeps the consumer CRUD surface stable. */
@Controller('finance-bots/:botId/ultimate')
export class FinanceUltimateController {
  constructor(
    private readonly sessions: FinanceConsumerSessionService,
    private readonly entitlements: FinanceEntitlementService,
    private readonly ultimate: FinanceUltimateService,
  ) {}

  @Get('overview') overview(@Param('botId') botId: string, @Req() request: Request) {
    return this.withUltimate(botId, request, 'FINANCIAL_FORECAST', (profileId) => this.ultimate.overview(profileId));
  }
  @Get('analytics') analytics(@Param('botId') botId: string, @Req() request: Request, @Query() query: FinanceUltimateQueryDto) {
    return this.withUltimate(botId, request, 'DEEP_ANALYTICS', (profileId) => this.ultimate.analytics(profileId, query));
  }
  @Get('items') items(@Param('botId') botId: string, @Req() request: Request, @Query() query: FinanceUltimateQueryDto) {
    return this.withUltimate(botId, request, 'ITEM_ANALYTICS', (profileId) => this.ultimate.items(profileId, query));
  }
  @Get('insights') insights(@Param('botId') botId: string, @Req() request: Request) {
    return this.withUltimate(botId, request, 'AUTOMATIC_INSIGHTS', (profileId) => this.ultimate.insights(profileId));
  }
  @Get('anomalies') anomalies(@Param('botId') botId: string, @Req() request: Request) {
    return this.withUltimate(botId, request, 'ANOMALY_DETECTION', (profileId) => this.ultimate.anomalies(profileId));
  }
  @Post('ask') ask(@Param('botId') botId: string, @Req() request: Request, @Body() body: FinanceUltimateQuestionDto) {
    return this.withUltimate(botId, request, 'FINANCE_HISTORY_QA', (profileId) => this.ultimate.answer(profileId, body));
  }

  private async withUltimate<T>(botId: string, request: Request, capability: FinanceCapability, action: (profileId: string) => Promise<T>) {
    const session = this.sessions.fromRequest(request, botId);
    const entitled = await this.entitlements.has({ botIntegrationId: botId, telegramBotUserId: session.telegramBotUserId, profileId: session.profileId }, capability);
    if (!entitled) throw new ForbiddenException('Ultimate Finance is required');
    return action(session.profileId);
  }
}
