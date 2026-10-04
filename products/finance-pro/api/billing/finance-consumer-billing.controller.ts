import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CreateStripeCheckoutDto } from '../../bot-billing/dto';
import { publicWebOrigin } from '../../../../config/deployment-config';
import { financeCheckoutReturnUrl } from '../telegram-presentation/finance-telegram-menu';
import { FinanceConsumerRequestService } from '../http/finance-consumer-request.service';
import { FinanceBillingService } from './finance-billing.service';
import { FinanceEntitlementService } from './finance-entitlement.service';

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
    @Body() dto: CreateStripeCheckoutDto,
  ) {
    const successUrl = financeCheckoutReturnUrl(botId, 'success');
    const cancelUrl = financeCheckoutReturnUrl(botId, 'cancelled');
    if (!successUrl || !cancelUrl) {
      throw new BadRequestException('Public web origin is not configured');
    }
    return this.billing.createStripeCheckout({
      botIntegrationId: botId,
      telegramBotUserId: this.requests.authenticate(botId, request)
        .telegramBotUserId,
      priceId: dto.priceId,
      requestedMode: dto.mode,
      couponCode: dto.couponCode,
      successUrl,
      cancelUrl,
    });
  }

  @Post('billing/stars/checkout')
  starsCheckout(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Body() dto: CreateStripeCheckoutDto,
  ) {
    return this.billing.createStarsCheckout({
      botIntegrationId: botId,
      telegramBotUserId: this.requests.authenticate(botId, request)
        .telegramBotUserId,
      priceId: dto.priceId,
    });
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
    return this.billing.stripePortal({
      botIntegrationId: botId,
      telegramBotUserId: this.requests.authenticate(botId, request)
        .telegramBotUserId,
      returnUrl: financePlansUrl(botId),
    });
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

function financePlansUrl(botId: string) {
  const path = `/finance/${encodeURIComponent(botId)}?screen=billing`;
  const origin = publicWebOrigin();
  return origin ? new URL(path, origin).toString() : path;
}
