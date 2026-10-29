import {
  ForbiddenException,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { FinanceConsumerRequestService } from '@consumer-finance/api/http/finance-consumer-request.service';
import { FinanceBillingService } from '@consumer-finance/api/billing/finance-billing.service';
import { FinanceEntitlementService } from '@consumer-finance/api/billing/finance-entitlement.service';

@Controller('finance-bots/:botId')
export class FinanceConsumerBillingController {
  constructor(
    private readonly requests: FinanceConsumerRequestService,
    private readonly billing: FinanceBillingService,
    private readonly entitlements: FinanceEntitlementService,
  ) {}

  @Get('billing')
  catalog(@Param('botId') botId: string, @Req() request: Request) {
    const session = this.requests.authenticate(botId, request);
    return this.billing.catalog({
      botIntegrationId: botId,
      telegramBotUserId: session.telegramBotUserId,
      profileId: session.profileId,
    });
  }

  @Get('entitlements')
  entitlementSummary(@Param('botId') botId: string, @Req() request: Request) {
    const session = this.requests.authenticate(botId, request);
    return this.entitlements.resolve({
      botIntegrationId: botId,
      telegramBotUserId: session.telegramBotUserId,
      profileId: session.profileId,
    });
  }

  @Post('billing/stripe/checkout')
  checkout(
    @Param('botId') botId: string,
    @Req() request: Request,
  ) {
    this.requests.authenticate(botId, request);
    throw new ForbiddenException('New Finance purchases are available only on standalone Finance Web');
  }

  @Post('billing/stars/checkout')
  starsCheckout(
    @Param('botId') botId: string,
    @Req() request: Request,
  ) {
    this.requests.authenticate(botId, request);
    throw new ForbiddenException('Legacy Finance offers are closed to new purchases');
  }

  @Post('billing/cancel-auto-renew')
  cancelAutoRenew(@Param('botId') botId: string, @Req() request: Request) {
    return this.setAutoRenewal(botId, request, true);
  }

  @Post('billing/resume-auto-renew')
  resumeAutoRenew(@Param('botId') botId: string, @Req() request: Request) {
    return this.setAutoRenewal(botId, request, false);
  }

  @Post('billing/payment-portal')
  paymentPortal(@Param('botId') botId: string, @Req() request: Request) {
    this.requests.authenticate(botId, request);
    throw new ForbiddenException('Stripe portal requires standalone Finance Web');
  }

  private setAutoRenewal(
    botId: string,
    request: Request,
    cancelAtPeriodEnd: boolean,
  ) {
    return this.billing.setStripeAutoRenewal({
      botIntegrationId: botId,
      telegramBotUserId: this.requests.authenticate(botId, request)
        .telegramBotUserId,
      cancelAtPeriodEnd,
    });
  }
}
