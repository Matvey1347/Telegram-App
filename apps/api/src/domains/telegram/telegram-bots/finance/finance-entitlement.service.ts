import { Injectable } from '@nestjs/common';
import type { BotBillingEntitlements } from '@telegram-system/shared';
import { BotEntitlementsService } from '../../bot-billing/bot-entitlements.service';

/**
 * The Finance vocabulary stays here while subscription state stays in the
 * reusable billing resolver. Premium handlers should ask this service for a
 * capability instead of interpreting provider statuses themselves.
 */
export const FINANCE_PRO_ENTITLEMENTS = [
  'AI_INPUT',
  'RECEIPT_SCAN',
  'SMART_LIMITS',
  'AI_ASSISTANT',
  'FINANCIAL_RADAR',
] as const;

export type FinanceProEntitlement = (typeof FINANCE_PRO_ENTITLEMENTS)[number];

@Injectable()
export class FinanceEntitlementService {
  constructor(private readonly billingEntitlements: BotEntitlementsService) {}

  resolve(input: { botIntegrationId: string; telegramBotUserId: string }) {
    return this.billingEntitlements.resolve(input);
  }

  async has(
    input: { botIntegrationId: string; telegramBotUserId: string },
    entitlement: FinanceProEntitlement,
  ) {
    const resolved = await this.resolve(input);
    return resolved.capabilities.includes(entitlement);
  }

  async paid(input: { botIntegrationId: string; telegramBotUserId: string }): Promise<BotBillingEntitlements> {
    return this.resolve(input);
  }
}
