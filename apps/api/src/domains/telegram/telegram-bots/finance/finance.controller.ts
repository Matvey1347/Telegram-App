import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { IsIn } from 'class-validator';
import type { Request, Response } from 'express';
import { BotBillingService } from '../../bot-billing/bot-billing.service';
import { CreateStripeCheckoutDto } from '../../bot-billing/dto';
import { TelegramBotDeliveryService } from '../core/telegram-bot-delivery.service';
import {
  FinanceConsumerSession,
  FinanceConsumerSessionService,
} from './finance-consumer-session.service';
import { FinanceConsumerTransferService } from './finance-consumer-transfer.service';
import { FinanceContextService } from './finance-context.service';
import { FinanceCoreService } from './finance-core.service';
import { FinanceLedgerService } from './finance-ledger.service';
import {
  CreateFinanceAccountDto,
  CreateFinanceCategoryDto,
  CreateFinanceGoalDto,
  CreateFinanceReminderDto,
  CreateFinanceTransactionDto,
  CreateFinanceTransferDto,
  FinanceHistoryQueryDto,
  UpdateFinanceAccountDto,
  UpdateFinanceSettingsDto,
  UpdateFinanceTransactionDto,
  UpsertFinanceLimitDto,
} from './finance.dto';
import { FinanceEntitlementService } from './finance-entitlement.service';
import { forecastMonthlyLimit } from './finance-smart-limits';

class DeleteFinanceDataDto {
  @IsIn(['DELETE MY FINANCE DATA']) confirmation!: 'DELETE MY FINANCE DATA';
}
@Controller('finance-bots/:botId')
export class FinanceController {
  constructor(
    private readonly contexts: FinanceContextService,
    private readonly sessions: FinanceConsumerSessionService,
    private readonly transfers: FinanceConsumerTransferService,
    private readonly core: FinanceCoreService,
    private readonly ledger: FinanceLedgerService,
    private readonly billing: BotBillingService,
    private readonly entitlements: FinanceEntitlementService,
    private readonly delivery: TelegramBotDeliveryService,
  ) {}
  private auth(botId: string, request: Request) {
    return this.sessions.fromRequest(request, botId);
  }
  private profile(s: FinanceConsumerSession) {
    return {
      id: s.profileId,
      defaultCurrency: s.defaultCurrency,
      workspaceId: s.workspaceId,
    };
  }
  private setCookie(res: Response, s: FinanceConsumerSession) {
    res.cookie(this.sessions.cookieName(), this.sessions.issue(s), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge:
        Number(process.env.FINANCE_CONSUMER_SESSION_TTL_SECONDS || 2592000) *
        1000,
    });
  }
  private browserRedirect(botId: string, returnTo?: string) {
    const path =
      returnTo && /^\/(?!\/)/.test(returnTo) ? returnTo : `/finance/${botId}`;
    const origin =
      process.env.FRONTEND_URL || process.env.FINANCE_MINI_APP_URL || '';
    return origin ? new URL(path, origin).toString() : path;
  }
  @Post('auth') async authBootstrap(
    @Param('botId') b: string,
    @Headers('x-telegram-init-data') initData: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const c = await this.contexts.fromInitData(b, initData);
    this.setCookie(res, {
      profileId: c.profile.id,
      botIntegrationId: c.bot.id,
      telegramBotUserId: c.telegramUser.id,
      telegramChatId: c.telegramUser.telegramChatId,
      workspaceId: c.bot.workspaceId,
      defaultCurrency: c.profile.defaultCurrency,
    });
    return { profile: await this.core.profile(c.profile.id) };
  }
  @Get('auth/session') async session(
    @Param('botId') b: string,
    @Req() r: Request,
  ) {
    return { profile: await this.core.profile(this.auth(b, r).profileId) };
  }
  @Get('auth/browser-config') async browserConfig(
    @Param('botId') botId: string,
    @Query('returnTo') returnTo?: string,
  ) {
    const config = await this.contexts.browserLoginConfig(botId);
    const target =
      returnTo && /^\/(?!\/)/.test(returnTo) ? returnTo : `/finance/${botId}`;
    const apiOrigin = (
      process.env.API_PUBLIC_URL ||
      process.env.PUBLIC_API_URL ||
      'http://localhost:4000'
    ).replace(/\/$/, '');
    return {
      botUsername: config.username,
      callbackUrl: `${apiOrigin}/api/finance-bots/${botId}/auth/browser?returnTo=${encodeURIComponent(target)}`,
    };
  }
  /** Telegram Login Widget callback. Telegram sends signed query parameters; redirect never retains them. */
  @Get('auth/browser') async browserLogin(
    @Param('botId') b: string,
    @Query() login: Record<string, string | undefined>,
    @Res() res: Response,
  ) {
    const c = await this.contexts.fromTelegramLogin(b, login);
    this.setCookie(res, {
      profileId: c.profile.id,
      botIntegrationId: c.bot.id,
      telegramBotUserId: c.telegramUser.id,
      telegramChatId: c.telegramUser.telegramChatId,
      workspaceId: c.bot.workspaceId,
      defaultCurrency: c.profile.defaultCurrency,
    });
    return res.redirect(this.browserRedirect(b, login.returnTo));
  }
  @Post('auth/transfer') createTransfer(
    @Param('botId') b: string,
    @Req() r: Request,
  ) {
    return this.transfers.create(this.auth(b, r));
  }
  /** Navigate to this API endpoint from the Mini App; it consumes the one-time token and redirects to a clean app URL. */
  @Get('auth/transfer') async consumeTransfer(
    @Param('botId') b: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const session = await this.transfers.consume(token, b);
    this.setCookie(res, session);
    return res.redirect(this.browserRedirect(b));
  }
  @Get('dashboard') async dashboard(
    @Param('botId') b: string,
    @Req() r: Request,
  ) {
    const p = this.profile(this.auth(b, r));
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const [profile, stats, limits, goal, recent] = await Promise.all([
      this.core.profile(p.id),
      this.ledger.stats(p.id, from, to),
      this.core.limits(p.id),
      this.core.goal(p.id),
      this.ledger.history(
        p.id,
        Object.assign(new FinanceHistoryQueryDto(), { limit: 8 }),
      ),
    ]);
    const currency = profile?.defaultCurrency || p.defaultCurrency;
    return {
      profile,
      stats: {
        ...stats,
        currency,
        categories: stats.categories.map((x) => ({ ...x, currency })),
      },
      limits,
      goal,
      recent: recent.items,
    };
  }
  @Patch('settings') settings(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: UpdateFinanceSettingsDto,
  ) {
    return this.core.updateSettings(this.auth(b, r).profileId, d);
  }
  @Get('accounts') accounts(@Param('botId') b: string, @Req() r: Request) {
    const c = this.auth(b, r);
    return this.ledger.accounts(c.profileId, c.defaultCurrency, c.workspaceId);
  }
  @Post('accounts') createAccount(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: CreateFinanceAccountDto,
  ) {
    return this.core.createAccount(this.auth(b, r).profileId, d);
  }
  @Patch('accounts/:id') updateAccount(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
    @Body() d: UpdateFinanceAccountDto,
  ) {
    return this.core.updateAccount(this.auth(b, r).profileId, id, d);
  }
  @Delete('accounts/:id') archiveAccount(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
  ) {
    return this.core.archiveAccount(this.auth(b, r).profileId, id);
  }
  @Get('categories') categories(@Param('botId') b: string, @Req() r: Request) {
    return this.core.categories(this.auth(b, r).profileId);
  }
  @Post('categories') createCategory(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: CreateFinanceCategoryDto,
  ) {
    return this.core.createCategory(this.auth(b, r).profileId, d);
  }
  @Delete('categories/:id') archiveCategory(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
  ) {
    return this.core.archiveCategory(this.auth(b, r).profileId, id);
  }
  @Get('transactions') history(
    @Param('botId') b: string,
    @Req() r: Request,
    @Query() q: FinanceHistoryQueryDto,
  ) {
    return this.ledger.history(this.auth(b, r).profileId, q);
  }
  @Post('transactions') createTransaction(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: CreateFinanceTransactionDto,
  ) {
    return this.ledger.createTransaction(this.profile(this.auth(b, r)), d);
  }
  @Patch('transactions/:id') updateTransaction(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
    @Body() d: UpdateFinanceTransactionDto,
  ) {
    return this.ledger.updateTransaction(this.profile(this.auth(b, r)), id, d);
  }
  @Delete('transactions/:id') removeTransaction(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
  ) {
    return this.ledger.removeTransaction(this.auth(b, r).profileId, id);
  }
  @Post('transactions/:id/undo') undo(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
  ) {
    return this.ledger.undo(this.auth(b, r).profileId, id);
  }
  @Post('transfers') transfer(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: CreateFinanceTransferDto,
  ) {
    return this.ledger.createTransfer(this.auth(b, r).profileId, d);
  }
  @Delete('transfers/:id') removeTransfer(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
  ) {
    return this.ledger.removeTransfer(this.auth(b, r).profileId, id);
  }
  @Get('stats') stats(
    @Param('botId') b: string,
    @Req() r: Request,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.ledger.stats(
      this.auth(b, r).profileId,
      new Date(from),
      new Date(to),
    );
  }
  @Get('analytics') analytics(
    @Param('botId') b: string,
    @Req() r: Request,
    @Query('period')
    period: 'CURRENT_MONTH' | 'PREVIOUS_MONTH' | 'LAST_3_MONTHS' | 'CUSTOM',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (
      !['CURRENT_MONTH', 'PREVIOUS_MONTH', 'LAST_3_MONTHS', 'CUSTOM'].includes(
        period,
      )
    )
      throw new BadRequestException('Invalid analytics period');
    return this.ledger.analytics(this.profile(this.auth(b, r)), {
      period,
      from,
      to,
    });
  }
  @Get('limits') limits(@Param('botId') b: string, @Req() r: Request) {
    return this.core.limits(this.auth(b, r).profileId);
  }
  @Post('limits') limit(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: UpsertFinanceLimitDto,
  ) {
    return this.core.upsertLimit(this.auth(b, r).profileId, d);
  }
  @Get('smart-limits') async smartLimits(
    @Param('botId') b: string,
    @Req() r: Request,
  ) {
    const c = this.auth(b, r);
    if (
      !(await this.entitlements.has(
        { botIntegrationId: b, telegramBotUserId: c.telegramBotUserId },
        'SMART_LIMITS',
      ))
    )
      return { code: 'PRO_REQUIRED', capability: 'SMART_LIMITS' };
    const limits = await this.core.limits(c.profileId);
    const now = new Date();
    const days = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return limits.map((x) => ({
      ...x,
      forecast: forecastMonthlyLimit({
        spentMinor: Math.round(Number(x.spent) * 100),
        limitMinor: Math.round(Number(x.amount) * 100),
        dayOfMonth: now.getUTCDate(),
        daysInMonth: days,
      }),
    }));
  }
  @Get('reminders') reminders(@Param('botId') b: string, @Req() r: Request) {
    return this.core.reminders(this.auth(b, r).profileId);
  }
  @Post('reminders') async reminder(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: CreateFinanceReminderDto,
  ) {
    const c = this.auth(b, r);
    const reminder = await this.core.createReminder(c.profileId, d);
    if (c.telegramChatId)
      await this.delivery.enqueueSendMessage({
        workspaceId: c.workspaceId,
        botIntegrationId: b,
        telegramBotUserId: c.telegramBotUserId,
        financeReminderId: reminder.id,
        chatId: c.telegramChatId,
        text: `Reminder: ${reminder.name}\n${reminder.amount.toString()} ${reminder.currency}`,
        scheduledAt: new Date(
          reminder.nextOccurrenceAt.getTime() -
            reminder.reminderOffsetMinutes * 60000,
        ),
        idempotencyKey: `finance-reminder:${reminder.id}:${reminder.nextOccurrenceAt.toISOString()}`,
      });
    return reminder;
  }
  @Get('goal') goal(@Param('botId') b: string, @Req() r: Request) {
    return this.core.goal(this.auth(b, r).profileId);
  }
  @Post('goal') createGoal(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: CreateFinanceGoalDto,
  ) {
    return this.core.createGoal(this.auth(b, r).profileId, d);
  }
  @Delete('goal/:id') deleteGoal(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
  ) {
    return this.core.deactivateGoal(this.auth(b, r).profileId, id);
  }
  @Get('export') exportData(@Param('botId') b: string, @Req() r: Request) {
    return this.core.export(this.auth(b, r).profileId);
  }
  @Delete('data') deleteData(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: DeleteFinanceDataDto,
  ) {
    if (d.confirmation !== 'DELETE MY FINANCE DATA')
      throw new BadRequestException('Invalid confirmation');
    return this.core.deleteData(this.auth(b, r).profileId);
  }
  @Get('billing') billingCatalog(@Param('botId') b: string, @Req() r: Request) {
    return this.billing.catalog(b, this.auth(b, r).telegramBotUserId);
  }
  @Post('billing/stripe/checkout') checkout(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: CreateStripeCheckoutDto,
  ) {
    return this.billing.createStripeCheckout({
      botIntegrationId: b,
      telegramBotUserId: this.auth(b, r).telegramBotUserId,
      priceId: d.priceId,
      requestedMode: d.mode,
      couponCode: d.couponCode,
    });
  }
  @Post('billing/stars/checkout') starsCheckout(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: CreateStripeCheckoutDto,
  ) {
    return this.billing.createStarsCheckout({
      botIntegrationId: b,
      telegramBotUserId: this.auth(b, r).telegramBotUserId,
      priceId: d.priceId,
    });
  }
}
