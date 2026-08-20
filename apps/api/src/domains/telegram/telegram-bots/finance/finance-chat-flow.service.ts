import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { FinanceCoreService } from './finance-core.service';

const FLOW_TTL_MS = 15 * 60 * 1000;
const COMMON_CURRENCIES = ['UAH', 'USD', 'EUR', 'PLN'] as const;
type AccountPayload = { name?: string; currency?: string };

export type AccountFlowResult =
  | { kind: 'name' }
  | { kind: 'currency'; name: string }
  | { kind: 'balance' }
  | { kind: 'created'; name: string; currency: string; balance: string }
  | { kind: 'invalid-name' | 'invalid-currency' | 'invalid-balance' | 'cancelled' }
  | null;

/** Durable, scoped wizard state. Expired/cancelled flows are never resumed. */
@Injectable()
export class FinanceChatFlowService {
  constructor(private readonly prisma: PrismaService, private readonly core: FinanceCoreService) {}

  async startAccount(profileId: string, botIntegrationId: string, telegramBotUserId: string): Promise<AccountFlowResult> {
    await this.prisma.financeChatFlow.upsert({
      where: { botIntegrationId_telegramBotUserId: { botIntegrationId, telegramBotUserId } },
      create: { profileId, botIntegrationId, telegramBotUserId, step: 'ACCOUNT_NAME', payload: {}, expiresAt: this.expiresAt() },
      update: { profileId, step: 'ACCOUNT_NAME', status: 'ACTIVE', payload: {}, expiresAt: this.expiresAt() },
    });
    return { kind: 'name' };
  }

  async cancel(botIntegrationId: string, telegramBotUserId: string): Promise<AccountFlowResult> {
    const result = await this.prisma.financeChatFlow.updateMany({ where: { botIntegrationId, telegramBotUserId, status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
    return result.count ? { kind: 'cancelled' } : null;
  }

  async consume(input: { profileId: string; botIntegrationId: string; telegramBotUserId: string; text: string }): Promise<AccountFlowResult> {
    const flow = await this.prisma.financeChatFlow.findUnique({ where: { botIntegrationId_telegramBotUserId: { botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId } } });
    if (!flow || flow.status !== 'ACTIVE' || flow.expiresAt <= new Date()) {
      if (flow?.status === 'ACTIVE') await this.prisma.financeChatFlow.update({ where: { id: flow.id }, data: { status: 'EXPIRED' } });
      return null;
    }
    const payload = (flow.payload || {}) as AccountPayload;
    if (flow.step === 'ACCOUNT_NAME') {
      const name = input.text.trim();
      if (!name || name.length > 80) return { kind: 'invalid-name' };
      await this.prisma.financeChatFlow.update({ where: { id: flow.id }, data: { step: 'ACCOUNT_CURRENCY', payload: { name }, expiresAt: this.expiresAt() } });
      return { kind: 'currency', name };
    }
    if (flow.step === 'ACCOUNT_CURRENCY') {
      const currency = input.text.trim().toUpperCase();
      if (!/^[A-Z]{3}$/u.test(currency)) return { kind: 'invalid-currency' };
      await this.prisma.financeChatFlow.update({ where: { id: flow.id }, data: { step: 'ACCOUNT_BALANCE', payload: { ...payload, currency }, expiresAt: this.expiresAt() } });
      return { kind: 'balance' };
    }
    if (flow.step !== 'ACCOUNT_BALANCE' || !payload.name || !payload.currency) return null;
    const normalized = input.text.trim().replace(',', '.');
    if (!/^[-+]?\d+(?:\.\d{1,2})?$/u.test(normalized)) return { kind: 'invalid-balance' };
    const claimed = await this.prisma.financeChatFlow.updateMany({ where: { id: flow.id, status: 'ACTIVE', step: 'ACCOUNT_BALANCE' }, data: { status: 'CREATING' } });
    if (!claimed.count) return null;
    try {
      const account = await this.core.createAccount(input.profileId, { name: payload.name, currency: payload.currency, openingBalance: normalized, type: 'OTHER' });
      await this.prisma.financeChatFlow.update({ where: { id: flow.id }, data: { status: 'COMPLETED', step: 'ACCOUNT_CREATED', payload: { ...payload, accountId: account.id } } });
      return { kind: 'created', name: account.name, currency: account.currency, balance: account.openingBalance.toString() };
    } catch (error) {
      await this.prisma.financeChatFlow.update({ where: { id: flow.id }, data: { status: 'ACTIVE' } });
      throw error;
    }
  }

  currencyKeyboard() {
    return [COMMON_CURRENCIES.slice(0, 2).map((currency) => ({ text: currency })), COMMON_CURRENCIES.slice(2).map((currency) => ({ text: currency }))];
  }

  private expiresAt() { return new Date(Date.now() + FLOW_TTL_MS); }
}
