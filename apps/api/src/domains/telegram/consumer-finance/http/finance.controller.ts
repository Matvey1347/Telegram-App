import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { IsIn, IsString, Matches } from 'class-validator';
import { randomBytes, timingSafeEqual } from 'crypto';
import type { CookieOptions, Request, Response } from 'express';
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
import { FinanceTransferService } from './finance-transfer.service';
import {
  CreateFinanceAccountDto,
  CreateFinanceCategoryDto,
  CreateFinanceGoalDto,
  CreateFinanceReminderDto,
  CreateFinanceTransactionDto,
  CreateFinanceTransferDto,
  FinanceHistoryQueryDto,
  FinanceTransferQueryDto,
  UpdateFinanceAccountDto,
  UpdateFinanceCategoryDto,
  UpdateFinanceSettingsDto,
  UpdateFinanceTransactionDto,
  UpdateFinanceTransferDto,
  UpsertFinanceLimitDto,
} from './finance.dto';
import { FinanceEntitlementService } from './finance-entitlement.service';
import { forecastMonthlyLimit } from './finance-smart-limits';
import { financeAnalyticsDateRange } from './finance-history-date-range';
import { financeChatLocale, t } from './i18n/finance-chat-i18n';
import { financeMainMenu } from './finance-bot-chat-responder.service';

class DeleteFinanceDataDto {
  @IsIn(['DELETE MY FINANCE DATA']) confirmation!: 'DELETE MY FINANCE DATA';
}

class FinanceBrowserLoginChallengeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{32}$/u)
  token!: string;
}
@Controller('finance-bots/:botId')
export class FinanceController {
  private readonly browserLoginStateCookie = 'finance_browser_login_state';

  constructor(
    private readonly contexts: FinanceContextService,
    private readonly sessions: FinanceConsumerSessionService,
    private readonly transfers: FinanceConsumerTransferService,
    private readonly core: FinanceCoreService,
    private readonly ledger: FinanceLedgerService,
    private readonly financeTransfers: FinanceTransferService,
    private readonly billing: BotBillingService,
    private readonly entitlements: FinanceEntitlementService,
    private readonly delivery: TelegramBotDeliveryService,
  ) {}
  private assertConsumerMutation(request: Request) {
    const method = request.method?.toUpperCase();
    if (
      method &&
      !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
      request.headers['x-finance-consumer-request'] !== '1'
    ) {
      throw new ForbiddenException('Finance consumer request is not trusted');
    }
  }
  private auth(botId: string, request: Request) {
    this.assertConsumerMutation(request);
    return this.sessions.fromRequest(request, botId);
  }
  private profile(s: FinanceConsumerSession) {
    return {
      id: s.profileId,
      defaultCurrency: s.defaultCurrency,
      workspaceId: s.workspaceId,
    };
  }
  private cookieOptions(
    botId: string,
    request: Request,
    ttlSeconds?: number,
  ): CookieOptions {
    const secure = this.requestIsSecure(request);
    return {
      httpOnly: true,
      secure,
      // Cross-site production deployments require None. Unsafe consumer
      // endpoints additionally require a custom, CORS-preflighted header.
      sameSite: secure ? 'none' : 'lax',
      path: `/api/finance-bots/${encodeURIComponent(botId)}`,
      ...(ttlSeconds === undefined ? {} : { maxAge: ttlSeconds * 1000 }),
    };
  }
  private requestIsSecure(request: Request) {
    const forwarded = request.headers['x-forwarded-proto'];
    const forwardedProtocol = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded;
    return (
      process.env.NODE_ENV === 'production' ||
      request.secure ||
      request.protocol === 'https' ||
      forwardedProtocol?.split(',')[0]?.trim().toLowerCase() === 'https'
    );
  }
  private browserLoginStateCookieOptions(
    botId: string,
    request: Request,
  ): CookieOptions {
    const secure = this.requestIsSecure(request);
    return {
      httpOnly: true,
      secure,
      sameSite: secure ? 'none' : 'lax',
      path: `/api/finance-bots/${encodeURIComponent(botId)}/auth/browser`,
      maxAge: 10 * 60 * 1000,
    };
  }
  private cookie(request: Request, name: string) {
    const header = request.headers.cookie;
    if (!header) return undefined;
    for (const item of header.split(';')) {
      const separator = item.indexOf('=');
      if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
      return item.slice(separator + 1).trim();
    }
    return undefined;
  }
  private stateMatches(
    expected: string | undefined,
    supplied: string | undefined,
  ) {
    if (!expected || !supplied) return false;
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    return (
      expectedBuffer.length === suppliedBuffer.length &&
      timingSafeEqual(expectedBuffer, suppliedBuffer)
    );
  }
  private async setCookie(
    res: Response,
    s: FinanceConsumerSession,
    botId: string,
    request: Request,
  ) {
    const issued = await this.sessions.issue(s);
    res.cookie(this.sessions.cookieName(), issued.token, {
      ...this.cookieOptions(botId, request, issued.ttlSeconds),
    });
  }
  private clearCookieOptions(options: CookieOptions) {
    const result = { ...options };
    delete result.maxAge;
    return result;
  }
  private clearCookie(res: Response, botId: string, request: Request) {
    res.clearCookie(
      this.sessions.cookieName(),
      this.clearCookieOptions(this.cookieOptions(botId, request)),
    );
  }
  private financeReturnPath(botId: string, returnTo?: string) {
    const fallback = `/finance/${botId}`;
    if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
      return fallback;
    }
    try {
      const parsed = new URL(returnTo, 'https://finance.invalid');
      return parsed.pathname === fallback
        ? `${parsed.pathname}${parsed.search}${parsed.hash}`
        : fallback;
    } catch {
      return fallback;
    }
  }
  private browserRedirect(botId: string, returnTo?: string) {
    const path = this.financeReturnPath(botId, returnTo);
    const origin =
      process.env.FRONTEND_URL || process.env.FINANCE_MINI_APP_URL || '';
    return origin ? new URL(path, origin).toString() : path;
  }
  @Post('auth') async authBootstrap(
    @Param('botId') b: string,
    @Headers('x-telegram-init-data') initData: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertConsumerMutation(request);
    const c = await this.contexts.fromInitData(b, initData);
    await this.setCookie(
      res,
      {
        profileId: c.profile.id,
        botIntegrationId: c.bot.id,
        telegramBotUserId: c.telegramUser.id,
        telegramChatId: c.telegramUser.telegramChatId,
        workspaceId: c.bot.workspaceId,
        defaultCurrency: c.profile.defaultCurrency,
      },
      b,
      request,
    );
    const profile = await this.core.profile(c.profile.id);
    if (!profile) {
      throw new InternalServerErrorException('Finance profile was not created');
    }
    return { authenticated: true as const, profile };
  }
  @Get('auth/session') async session(
    @Param('botId') b: string,
    @Req() r: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const inspection = this.sessions.inspectRequest(r, b);
    if (!inspection.authenticated) {
      if (inspection.clearCookie) this.clearCookie(res, b, r);
      return { authenticated: false as const };
    }
    const profile = await this.core.profile(inspection.session.profileId);
    if (!profile) {
      this.clearCookie(res, b, r);
      return { authenticated: false as const };
    }
    return { authenticated: true as const, profile };
  }
  @Post('auth/logout') logout(
    @Param('botId') b: string,
    @Req() request: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertConsumerMutation(request);
    this.clearCookie(res, b, request);
    return { authenticated: false as const };
  }
  @Get('auth/browser-config') async browserConfig(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('returnTo') returnTo?: string,
  ) {
    const config = await this.contexts.browserLoginConfig(botId);
    const target = this.financeReturnPath(botId, returnTo);
    const state = randomBytes(32).toString('base64url');
    const apiOrigin = (
      process.env.API_PUBLIC_URL ||
      process.env.PUBLIC_API_URL ||
      'http://localhost:4000'
    ).replace(/\/$/, '');
    res.cookie(
      this.browserLoginStateCookie,
      state,
      this.browserLoginStateCookieOptions(botId, request),
    );
    return {
      botUsername: config.username,
      callbackUrl: `${apiOrigin}/api/finance-bots/${botId}/auth/browser?returnTo=${encodeURIComponent(target)}&state=${encodeURIComponent(state)}`,
    };
  }
  @Post('auth/browser-challenge') async createBrowserLoginChallenge(
    @Param('botId') botId: string,
    @Req() request: Request,
  ) {
    this.assertConsumerMutation(request);
    const config = await this.contexts.browserLoginConfig(botId);
    return this.transfers.createBrowserLogin(botId, config.username);
  }
  @Post('auth/browser-challenge/consume') async consumeBrowserLoginChallenge(
    @Param('botId') botId: string,
    @Body() input: FinanceBrowserLoginChallengeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertConsumerMutation(request);
    const result = await this.transfers.consumeBrowserLogin(input.token, botId);
    if (result.status !== 'approved') return result;
    await this.setCookie(res, result.session, botId, request);
    const profile = await this.core.profile(result.session.profileId);
    if (!profile) {
      throw new InternalServerErrorException('Finance profile was not created');
    }
    return { status: 'authenticated' as const, profile };
  }
  /** Telegram Login Widget callback. Telegram sends signed query parameters; redirect never retains them. */
  @Get('auth/browser') async browserLogin(
    @Param('botId') b: string,
    @Query() login: Record<string, string | undefined>,
    @Req() request: Request,
    @Res() res: Response,
  ) {
    const stateCookie = this.cookie(request, this.browserLoginStateCookie);
    if (!this.stateMatches(stateCookie, login.state)) {
      throw new ForbiddenException('Finance browser login state is invalid');
    }
    res.clearCookie(
      this.browserLoginStateCookie,
      this.clearCookieOptions(this.browserLoginStateCookieOptions(b, request)),
    );
    const c = await this.contexts.fromTelegramLogin(b, login);
    await this.setCookie(
      res,
      {
        profileId: c.profile.id,
        botIntegrationId: c.bot.id,
        telegramBotUserId: c.telegramUser.id,
        telegramChatId: c.telegramUser.telegramChatId,
        workspaceId: c.bot.workspaceId,
        defaultCurrency: c.profile.defaultCurrency,
      },
      b,
      request,
    );
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
    @Req() request: Request,
    @Res() res: Response,
  ) {
    const session = await this.transfers.consume(token, b);
    await this.setCookie(res, session, b, request);
    return res.redirect(this.browserRedirect(b));
  }
  @Get('dashboard') async dashboard(
    @Param('botId') b: string,
    @Req() r: Request,
  ) {
    const p = this.profile(this.auth(b, r));
    const profile = await this.core.profile(p.id);
    if (!profile) throw new NotFoundException('Finance profile not found');
    const { from, to } = financeAnalyticsDateRange(
      { period: 'CURRENT_MONTH' },
      profile.timezone,
    );
    const [stats, limits, goal, recent] = await Promise.all([
      this.ledger.stats(p.id, from, to),
      this.core.limits(p.id),
      this.core.goal(p.id),
      this.ledger.history(
        p.id,
        Object.assign(new FinanceHistoryQueryDto(), { limit: 8 }),
      ),
    ]);
    const currency = profile.defaultCurrency;
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
  @Patch('settings') async settings(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: UpdateFinanceSettingsDto,
  ) {
    const session = this.auth(b, r);
    const before = await this.core.profile(session.profileId);
    const updated = await this.core.updateSettings(session.profileId, d);
    if (d.locale && before?.locale !== updated?.locale) {
      const target = await this.core.notificationTarget(session.profileId);
      if (target?.telegramUser.telegramChatId) {
        const locale = financeChatLocale(updated?.locale, target.telegramUser.languageCode);
        await this.delivery.enqueueSendMessage({
          workspaceId: target.botIntegration.workspaceId,
          botIntegrationId: target.botIntegrationId,
          runtimeInstanceId: target.telegramUser.runtimeInstanceId,
          telegramBotUserId: target.telegramUser.id,
          chatId: target.telegramUser.telegramChatId,
          text: t(locale, 'languageSaved'),
          replyKeyboard: financeMainMenu(target.botIntegrationId, locale),
          idempotencyKey: `finance-language:${session.profileId}:${locale}:${Date.now()}`,
        });
      }
    }
    return updated;
  }
  @Get('accounts') accounts(@Param('botId') b: string, @Req() r: Request) {
    const c = this.auth(b, r);
    return this.ledger.accounts(c.profileId);
  }
  @Post('accounts') async createAccount(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: CreateFinanceAccountDto,
  ) {
    const profileId = this.auth(b, r).profileId;
    const created = await this.core.createAccount(profileId, d);
    return this.ledger.account(profileId, created.id);
  }
  @Patch('accounts/:id') async updateAccount(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
    @Body() d: UpdateFinanceAccountDto,
  ) {
    const profileId = this.auth(b, r).profileId;
    await this.core.updateAccount(profileId, id, d);
    return this.ledger.account(profileId, id);
  }
  @Delete('accounts/:id') async archiveAccount(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
  ) {
    const profileId = this.auth(b, r).profileId;
    await this.core.archiveAccount(profileId, id);
    return this.ledger.account(profileId, id);
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
  @Patch('categories/:id') updateCategory(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
    @Body() d: UpdateFinanceCategoryDto,
  ) {
    return this.core.updateCategory(this.auth(b, r).profileId, id, d);
  }
  @Delete('categories/:id') archiveCategory(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
  ) {
    return this.core.archiveCategory(this.auth(b, r).profileId, id);
  }
  @Get('transactions') async history(
    @Param('botId') b: string,
    @Req() r: Request,
    @Query() q: FinanceHistoryQueryDto,
  ) {
    const profileId = this.auth(b, r).profileId;
    const profile = await this.core.profile(profileId);
    return this.ledger.history(profileId, q, profile?.timezone);
  }
  @Get('transactions/:id') transactionDetail(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
  ) {
    return this.ledger.detail(this.auth(b, r).profileId, id);
  }
  @Post('transactions') async createTransaction(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: CreateFinanceTransactionDto,
  ) {
    const profileId = this.auth(b, r).profileId;
    return this.ledger.createTransaction(
      await this.ledger.profileContext(profileId),
      d,
    );
  }
  @Patch('transactions/:id') async updateTransaction(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
    @Body() d: UpdateFinanceTransactionDto,
  ) {
    const profileId = this.auth(b, r).profileId;
    return this.ledger.updateTransaction(
      await this.ledger.profileContext(profileId),
      id,
      d,
    );
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
  @Get('transfers') async transferHistory(
    @Param('botId') b: string,
    @Req() r: Request,
    @Query() q: FinanceTransferQueryDto,
  ) {
    const profileId = this.auth(b, r).profileId;
    const profile = await this.core.profile(profileId);
    return this.financeTransfers.history(profileId, q, profile?.timezone);
  }
  @Post('transfers') transfer(
    @Param('botId') b: string,
    @Req() r: Request,
    @Body() d: CreateFinanceTransferDto,
  ) {
    return this.financeTransfers.create(this.auth(b, r).profileId, d);
  }
  @Patch('transfers/:id') updateTransfer(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
    @Body() d: UpdateFinanceTransferDto,
  ) {
    return this.financeTransfers.update(this.auth(b, r).profileId, id, d);
  }
  @Delete('transfers/:id') removeTransfer(
    @Param('botId') b: string,
    @Param('id') id: string,
    @Req() r: Request,
  ) {
    return this.financeTransfers.remove(this.auth(b, r).profileId, id);
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
  @Get('analytics') async analytics(
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
    const profileId = this.auth(b, r).profileId;
    return this.ledger.analytics(await this.ledger.profileContext(profileId), {
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
    const profile = await this.core.profile(c.profileId);
    if (!profile) throw new NotFoundException('Finance profile not found');
    const localParts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: profile.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(new Date())
        .map((part) => [part.type, part.value]),
    );
    const localYear = Number(localParts.year);
    const localMonth = Number(localParts.month);
    const localDay = Number(localParts.day);
    const days = new Date(Date.UTC(localYear, localMonth, 0)).getUTCDate();
    return limits.map((x) => ({
      ...x,
      forecast: forecastMonthlyLimit({
        spentMinor: Math.round(Number(x.spent) * 100),
        limitMinor: Math.round(Number(x.amount) * 100),
        dayOfMonth: localDay,
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
    if (c.telegramChatId) {
      const profile = await this.core.profile(c.profileId);
      await this.delivery.enqueueSendMessage({
        workspaceId: c.workspaceId,
        botIntegrationId: b,
        telegramBotUserId: c.telegramBotUserId,
        financeReminderId: reminder.id,
        chatId: c.telegramChatId,
        text: t(profile?.locale ?? 'en', 'reminderNotification', {
          name: reminder.name,
          amount: reminder.amount.toString(),
          currency: reminder.currency,
        }),
        scheduledAt: new Date(
          reminder.nextOccurrenceAt.getTime() -
            reminder.reminderOffsetMinutes * 60000,
        ),
        idempotencyKey: `finance-reminder:${reminder.id}:${reminder.nextOccurrenceAt.toISOString()}`,
      });
    }
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
  @Get('entitlements') entitlementSummary(
    @Param('botId') b: string,
    @Req() r: Request,
  ) {
    const session = this.auth(b, r);
    return this.entitlements.resolve({
      botIntegrationId: b,
      telegramBotUserId: session.telegramBotUserId,
      profileId: session.profileId,
    });
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
  @Post('billing/cancel-auto-renew') cancelAutoRenew(
    @Param('botId') b: string,
    @Req() r: Request,
  ) {
    return this.billing.setStripeAutoRenewal({
      botIntegrationId: b,
      telegramBotUserId: this.auth(b, r).telegramBotUserId,
      cancelAtPeriodEnd: true,
    });
  }
  @Post('billing/resume-auto-renew') resumeAutoRenew(
    @Param('botId') b: string,
    @Req() r: Request,
  ) {
    return this.billing.setStripeAutoRenewal({
      botIntegrationId: b,
      telegramBotUserId: this.auth(b, r).telegramBotUserId,
      cancelAtPeriodEnd: false,
    });
  }
  @Post('billing/payment-portal') paymentPortal(
    @Param('botId') b: string,
    @Req() r: Request,
  ) {
    return this.billing.stripePortal({
      botIntegrationId: b,
      telegramBotUserId: this.auth(b, r).telegramBotUserId,
      returnUrl: this.browserRedirect(b, `/finance/${b}?screen=settings`),
    });
  }
}
