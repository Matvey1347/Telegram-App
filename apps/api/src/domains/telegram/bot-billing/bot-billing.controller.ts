import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { BotBillingService } from './bot-billing.service';
import { BillingSubscribersQueryDto, BillingUsersQueryDto, CreateBillingCouponDto, CreateBillingGrantDto, CreateBillingPlanDto, CreateBillingPlanPriceDto, RevokeBillingGrantDto, SetBillingPriceVisibilityDto, UpdateFinanceSupportProfileDto, UpsertBillingProviderConfigDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class BotBillingController {
  constructor(private readonly billing: BotBillingService) {}

  @Get('telegram-bots/:botId/billing/providers') providers(@CurrentUser() user: JwtUser, @Param('botId') botId: string) { return this.billing.providerResolution(user.sub, botId); }
  @Patch('billing/providers/:provider/:mode') workspaceProvider(@CurrentUser() user: JwtUser, @Param('provider') provider: 'STRIPE' | 'TELEGRAM_STARS', @Param('mode') mode: 'TEST' | 'LIVE', @Body() dto: UpsertBillingProviderConfigDto) { return this.billing.saveProviderConfig(user.sub, { provider, mode, dto }); }
  @Delete('billing/providers/:provider/:mode') removeWorkspaceProvider(@CurrentUser() user: JwtUser, @Param('provider') provider: 'STRIPE' | 'TELEGRAM_STARS', @Param('mode') mode: 'TEST' | 'LIVE') { return this.billing.removeWorkspaceProviderDefault(user.sub, provider, mode); }
  @Patch('telegram-bots/:botId/billing/providers/:provider/:mode') botProvider(@CurrentUser() user: JwtUser, @Param('botId') botIntegrationId: string, @Param('provider') provider: 'STRIPE' | 'TELEGRAM_STARS', @Param('mode') mode: 'TEST' | 'LIVE', @Body() dto: UpsertBillingProviderConfigDto) { return this.billing.saveProviderConfig(user.sub, { botIntegrationId, provider, mode, dto }); }
  @Delete('telegram-bots/:botId/billing/providers/:provider/:mode') useGlobalDefault(@CurrentUser() user: JwtUser, @Param('botId') botIntegrationId: string, @Param('provider') provider: 'STRIPE' | 'TELEGRAM_STARS', @Param('mode') mode: 'TEST' | 'LIVE') { return this.billing.useWorkspaceProviderDefault(user.sub, botIntegrationId, provider, mode); }
  @Post('telegram-bots/:botId/billing/plans') createPlan(@CurrentUser() user: JwtUser, @Param('botId') botId: string, @Body() dto: CreateBillingPlanDto) { return this.billing.createPlan(user.sub, botId, dto); }
  @Post('telegram-bots/:botId/billing/plans/:planId/prices') addPrice(@CurrentUser() user: JwtUser, @Param('botId') botId: string, @Param('planId') planId: string, @Body() dto: CreateBillingPlanPriceDto) { return this.billing.addPrice(user.sub, botId, planId, dto); }
  @Patch('telegram-bots/:botId/billing/prices/:priceId') priceVisibility(@CurrentUser() user: JwtUser, @Param('botId') botId: string, @Param('priceId') priceId: string, @Body() dto: SetBillingPriceVisibilityDto) { return this.billing.setPriceVisibility(user.sub, botId, priceId, dto); }
  @Post('telegram-bots/:botId/billing/grants') grant(@CurrentUser() user: JwtUser, @Param('botId') botId: string, @Body() dto: CreateBillingGrantDto) { return this.billing.grant(user.sub, botId, dto); }
  @Patch('telegram-bots/:botId/billing/grants/:grantId/revoke') revoke(@CurrentUser() user: JwtUser, @Param('botId') botId: string, @Param('grantId') grantId: string, @Body() dto: RevokeBillingGrantDto) { return this.billing.revokeGrant(user.sub, botId, grantId, dto.reason); }
  @Get('telegram-bots/:botId/billing/overview') overview(@CurrentUser() user: JwtUser, @Param('botId') botId: string, @Query() query: BillingUsersQueryDto) { return this.billing.overview(user.sub, botId, query.environment); }
  @Get('telegram-bots/:botId/billing/plans') plans(@CurrentUser() user: JwtUser, @Param('botId') botId: string) { return this.billing.plans(user.sub, botId); }
  @Get('telegram-bots/:botId/billing/coupons') coupons(@CurrentUser() user: JwtUser, @Param('botId') botId: string) { return this.billing.coupons(user.sub, botId); }
  @Get('telegram-bots/:botId/billing/subscribers') subscribers(@CurrentUser() user: JwtUser, @Param('botId') botId: string, @Query() query: BillingSubscribersQueryDto) { return this.billing.subscribers(user.sub, botId, query); }
  @Get('telegram-bots/:botId/billing/users') users(@CurrentUser() user: JwtUser, @Param('botId') botId: string, @Query() query: BillingUsersQueryDto) { return this.billing.users(user.sub, botId, query); }
  @Patch('telegram-bots/:botId/billing/users/:telegramBotUserId/finance-profile') repairUser(@CurrentUser() user: JwtUser, @Param('botId') botId: string, @Param('telegramBotUserId') telegramBotUserId: string, @Body() dto: UpdateFinanceSupportProfileDto) { return this.billing.updateFinanceSupportProfile(user.sub, botId, telegramBotUserId, dto); }
  @Post('telegram-bots/:botId/billing/coupons') coupon(@CurrentUser() user: JwtUser, @Param('botId') botId: string, @Body() dto: CreateBillingCouponDto) { return this.billing.createCoupon(user.sub, botId, dto); }
  @Post('telegram-bots/:botId/finance-billing/sync') syncFinance(@CurrentUser() user: JwtUser, @Param('botId') botId: string) { return this.billing.syncFinanceCatalog(user.sub, botId); }
  @Post('telegram-bots/:botId/finance-billing/coupons/:couponId/sync') syncFinanceCoupon(@CurrentUser() user: JwtUser, @Param('botId') botId: string, @Param('couponId') couponId: string) { return this.billing.syncCouponToStripe(user.sub, botId, couponId); }
  @Get('billing/providers') workspaceProviders(@CurrentUser() user: JwtUser) { return this.billing.workspaceProviderResolution(user.sub); }
}
