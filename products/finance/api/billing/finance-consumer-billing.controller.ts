import {
  BadRequestException,
  Body,
  ForbiddenException,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import {
  financeStandaloneWebOrigin,
  publicWebOrigin,
} from "@api/config/deployment-config";
import { FinanceConsumerRequestService } from "@consumer-finance/api/http/finance-consumer-request.service";
import { FinanceBillingService } from "@consumer-finance/api/billing/finance-billing.service";
import { FinanceEntitlementService } from "@consumer-finance/api/billing/finance-entitlement.service";

@Controller("finance-bots/:botId")
export class FinanceConsumerBillingController {
  constructor(
    private readonly requests: FinanceConsumerRequestService,
    private readonly billing: FinanceBillingService,
    private readonly entitlements: FinanceEntitlementService,
  ) {}

  @Get("billing")
  catalog(@Param("botId") botId: string, @Req() request: Request) {
    const session = this.requests.authenticate(botId, request);
    return this.billing.catalog({
      botIntegrationId: botId,
      telegramBotUserId: session.telegramBotUserId,
      profileId: session.profileId,
    });
  }

  @Get("entitlements")
  entitlementSummary(@Param("botId") botId: string, @Req() request: Request) {
    const session = this.requests.authenticate(botId, request);
    return this.entitlements.resolve({
      botIntegrationId: botId,
      telegramBotUserId: session.telegramBotUserId,
      profileId: session.profileId,
    });
  }

  @Post("billing/stripe/checkout")
  checkout(
    @Param("botId") botId: string,
    @Req() request: Request,
    @Body() input: { priceId?: string; mode?: string; couponCode?: string },
  ) {
    const session = this.requests.authenticate(botId, request);
    if (typeof input?.priceId !== "string" || !input.priceId.trim())
      throw new BadRequestException("A Finance plan price is required");
    if (input.couponCode !== undefined && typeof input.couponCode !== "string")
      throw new BadRequestException("Invalid coupon code");
    if (input.mode && !["TEST", "LIVE"].includes(input.mode))
      throw new BadRequestException("Invalid Stripe mode");
    const returnUrl = this.financeReturnUrl(botId);
    return this.billing.createStripeCheckout({
      botIntegrationId: botId,
      telegramBotUserId: session.telegramBotUserId,
      priceId: input.priceId,
      requestedMode: input.mode as "TEST" | "LIVE" | undefined,
      couponCode: input.couponCode,
      successUrl: `${returnUrl}&checkout=success`,
      cancelUrl: `${returnUrl}&checkout=cancel`,
    });
  }

  @Post("billing/stars/checkout")
  starsCheckout(@Param("botId") botId: string, @Req() request: Request) {
    this.requests.authenticate(botId, request);
    throw new ForbiddenException(
      "Legacy Finance offers are closed to new purchases",
    );
  }

  @Post("billing/cancel-auto-renew")
  cancelAutoRenew(@Param("botId") botId: string, @Req() request: Request) {
    return this.setAutoRenewal(botId, request, true);
  }

  @Post("billing/resume-auto-renew")
  resumeAutoRenew(@Param("botId") botId: string, @Req() request: Request) {
    return this.setAutoRenewal(botId, request, false);
  }

  @Post("billing/payment-portal")
  paymentPortal(@Param("botId") botId: string, @Req() request: Request) {
    const session = this.requests.authenticate(botId, request);
    return this.billing.stripePortal({
      botIntegrationId: botId,
      telegramBotUserId: session.telegramBotUserId,
      returnUrl: this.financeReturnUrl(botId),
    });
  }

  private financeReturnUrl(botId: string) {
    const standalone = financeStandaloneWebOrigin();
    const origin = standalone ?? publicWebOrigin();
    if (!origin)
      throw new BadRequestException("Finance return URL is not configured");
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new BadRequestException("Finance return URL is invalid");
    }
    if (!["http:", "https:"].includes(url.protocol))
      throw new BadRequestException("Finance return URL is invalid");
    return new URL(
      standalone
        ? "/app/subscription?screen=subscription"
        : `/finance/${encodeURIComponent(botId)}?screen=billing`,
      url.origin,
    ).toString();
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
