import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { FinanceSessionService } from '../identity/finance-session.service';
import { FinanceBillingService } from './finance-billing.service';
import { FinanceStripeWebhookService } from './finance-stripe-webhook.service';

@Controller('finance/:financeBotId/billing')
export class FinanceBillingController {
  constructor(private readonly sessions: FinanceSessionService, private readonly billing: FinanceBillingService) {}
  @Get() catalog(@Param('financeBotId') botId: string, @Headers('authorization') auth: string | undefined, @Headers('cookie') cookie: string | undefined, @Headers('origin') origin: string | undefined) {
    return this.billing.catalog(this.sessions.authenticateBrowser(auth, cookie, origin, botId));
  }
  @Post('checkout') checkout(@Param('financeBotId') botId: string, @Headers('authorization') auth: string | undefined, @Headers('cookie') cookie: string | undefined, @Headers('origin') origin: string | undefined, @Body() input: { offerCode?: string }) {
    if (!input || !['INTRO','MONTH','QUARTER','YEAR'].includes(input.offerCode || '')) throw new BadRequestException('Invalid Finance offer');
    const session = this.sessions.authenticateBrowser(auth, cookie, origin, botId, true);
    this.sessions.assertExternalCheckout(session);
    return this.billing.checkout(session, input.offerCode as 'INTRO'|'MONTH'|'QUARTER'|'YEAR');
  }
  @Post('portal') portal(@Param('financeBotId') botId: string, @Headers('authorization') auth: string | undefined, @Headers('cookie') cookie: string | undefined, @Headers('origin') origin: string | undefined) {
    const session = this.sessions.authenticateBrowser(auth, cookie, origin, botId, true);
    this.sessions.assertExternalCheckout(session);
    return this.billing.portal(session);
  }
  @Post('cancel') cancel(@Param('financeBotId') botId: string, @Headers('authorization') auth: string | undefined, @Headers('cookie') cookie: string | undefined, @Headers('origin') origin: string | undefined) {
    return this.billing.setCancel(this.sessions.authenticateBrowser(auth, cookie, origin, botId, true), true);
  }
  @Post('resume') resume(@Param('financeBotId') botId: string, @Headers('authorization') auth: string | undefined, @Headers('cookie') cookie: string | undefined, @Headers('origin') origin: string | undefined) {
    return this.billing.setCancel(this.sessions.authenticateBrowser(auth, cookie, origin, botId, true), false);
  }
}

@Controller('finance/billing/webhooks/stripe')
export class FinanceStripeWebhookController {
  constructor(private readonly webhook: FinanceStripeWebhookService) {}
  @Post(':mode') receive(@Param('mode') mode: string, @Headers('stripe-signature') signature: string | undefined, @Req() request: RawBodyRequest<Request>) {
    if (mode !== 'TEST' && mode !== 'LIVE') throw new BadRequestException('Invalid Stripe mode');
    return this.webhook.receive(mode, signature, request.rawBody);
  }
}
