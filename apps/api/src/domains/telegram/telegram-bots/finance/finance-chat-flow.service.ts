import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import { FinanceCoreService } from './finance-core.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinanceTransferService } from './finance-transfer.service';

const FLOW_TTL_MS = 15 * 60 * 1000;
const COMMON_CURRENCIES = ['UAH', 'USD', 'EUR', 'PLN'] as const;

export type FinanceFlowKind = 'TRANSACTION_CREATE' | 'ACCOUNT_CREATE' | 'ACCOUNT_EDIT' | 'CATEGORY_CREATE' | 'CATEGORY_EDIT' | 'CATEGORY_ARCHIVE' | 'TRANSFER_CREATE' | 'SETTINGS_LANGUAGE';
type Payload = Record<string, string | null | undefined>;
export type FinanceFlowInput = { profileId: string; botIntegrationId: string; telegramBotUserId: string };
export type FinanceFlowCallback =
  | { action: 'back' | 'cancel' | 'confirm' | 'skip'; revision?: string }
  | { action: 'account' | 'category' | 'parent' | 'type' | 'currency' | 'language' | 'page'; id: string; revision?: string };
export type FinanceFlowResult =
  | { kind: 'prompt'; flow: FinanceFlowKind; step: string; payload: Payload; page?: number }
  | { kind: 'review'; flow: FinanceFlowKind; step: string; payload: Payload; page?: number }
  | { kind: 'created' | 'updated'; flow: FinanceFlowKind; id: string; payload: Payload }
  | { kind: 'invalid'; flow: FinanceFlowKind; reason: 'text' | 'amount' | 'currency' | 'selection' }
  | { kind: 'cancelled' | 'expired'; flow?: FinanceFlowKind } | null;
export type AccountFlowResult = { kind: 'name' } | { kind: 'currency'; name: string } | { kind: 'balance' } | { kind: 'created'; name: string; currency: string; balance: string } | { kind: 'invalid-name' | 'invalid-currency' | 'invalid-balance' | 'cancelled' } | null;

/** Durable one-user state machine. Callbacks contain an action and opaque id only. */
@Injectable()
export class FinanceChatFlowService {
  constructor(private readonly prisma: PrismaService, private readonly core: FinanceCoreService, private readonly ledger?: FinanceLedgerService, private readonly transfers?: FinanceTransferService) {}

  async start(input: FinanceFlowInput & { flow: FinanceFlowKind; type?: 'INCOME' | 'EXPENSE'; entityId?: string }): Promise<FinanceFlowResult> {
    const payload: Payload = { flow: input.flow, revision: this.revision(), resultId: randomUUID(), occurredAt: new Date().toISOString(), ...(input.type ? { type: input.type } : {}), ...(input.entityId ? { entityId: input.entityId } : {}) };
    const step = this.initial(input.flow);
    await this.persistStart(input, input.flow, step, payload);
    return this.result(input.flow, step, payload);
  }
  startTransaction(input: FinanceFlowInput & { type: 'INCOME' | 'EXPENSE' }) { return this.start({ ...input, flow: 'TRANSACTION_CREATE', type: input.type }); }
  async startAccountEdit(input: FinanceFlowInput & { accountId: string }) {
    const account = (await this.requireLedger().accounts(input.profileId)).find((item) => item.id === input.accountId && !item.archivedAt);
    if (!account) return null;
    const payload: Payload = { flow: 'ACCOUNT_EDIT', revision: this.revision(), entityId: account.id, name: account.name, type: account.type };
    await this.persistStart(input, 'ACCOUNT_EDIT', 'ACCOUNT_NAME', payload);
    return this.result('ACCOUNT_EDIT', 'ACCOUNT_NAME', payload);
  }
  startCategory(input: FinanceFlowInput & { type?: 'INCOME' | 'EXPENSE' }) { return this.start({ ...input, flow: 'CATEGORY_CREATE' }); }
  async startCategoryEdit(input: FinanceFlowInput & { categoryId: string }) {
    const category = (await this.core.categories(input.profileId)).find((item) => item.id === input.categoryId && !item.archivedAt);
    if (!category) return null;
    const payload: Payload = { flow: 'CATEGORY_EDIT', revision: this.revision(), entityId: category.id, type: category.type, name: category.name, parentId: category.parentId };
    await this.persistStart(input, 'CATEGORY_EDIT', 'CATEGORY_NAME', payload);
    return this.result('CATEGORY_EDIT', 'CATEGORY_NAME', payload);
  }
  async startCategoryArchive(input: FinanceFlowInput & { categoryId: string }) {
    const category = (await this.core.categories(input.profileId)).find((item) => item.id === input.categoryId && !item.archivedAt);
    if (!category) return null;
    const payload: Payload = { flow: 'CATEGORY_ARCHIVE', revision: this.revision(), entityId: category.id, type: category.type, name: category.name };
    await this.persistStart(input, 'CATEGORY_ARCHIVE', 'CATEGORY_ARCHIVE_REVIEW', payload);
    return this.result('CATEGORY_ARCHIVE', 'CATEGORY_ARCHIVE_REVIEW', payload);
  }
  async startTransfer(input: FinanceFlowInput) {
    if ((await this.activeAccounts(input.profileId)).length < 2) return null;
    return this.start({ ...input, flow: 'TRANSFER_CREATE' });
  }
  startLanguage(input: FinanceFlowInput) { return this.start({ ...input, flow: 'SETTINGS_LANGUAGE' }); }

  // Kept while the existing account-only responder is migrated to `start`.
  async startAccount(profileId: string, botIntegrationId: string, telegramBotUserId: string): Promise<AccountFlowResult> {
    await this.persistStart({ profileId, botIntegrationId, telegramBotUserId }, 'ACCOUNT_CREATE', 'ACCOUNT_NAME', { flow: 'ACCOUNT_CREATE', revision: this.revision(), resultId: randomUUID() });
    return { kind: 'name' };
  }
  async cancel(botIntegrationId: string, telegramBotUserId: string): Promise<AccountFlowResult> {
    const row = await this.prisma.financeChatFlow.updateMany({ where: { botIntegrationId, telegramBotUserId, status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
    return row.count ? { kind: 'cancelled' } : null;
  }
  async cancelFlow(input: Omit<FinanceFlowInput, 'profileId'>): Promise<FinanceFlowResult> { return (await this.cancel(input.botIntegrationId, input.telegramBotUserId)) ? { kind: 'cancelled' } : null; }
  async consume(input: FinanceFlowInput & { text: string }): Promise<AccountFlowResult> { return this.legacy(await this.consumeText(input)); }

  async consumeText(input: FinanceFlowInput & { text: string }): Promise<FinanceFlowResult> {
    const row = await this.active(input); if (!row) return null;
    const payload = this.payload(row.payload); const flow = row.operationKind as FinanceFlowKind;
    if (row.status === 'EXPIRED') return { kind: 'expired', flow };
    const field = this.field(row.step); if (!flow || !field) return { kind: 'invalid', flow, reason: 'selection' };
    const text = input.text.trim();
    if (field === 'amount' && !this.amount(text, row.step === 'ACCOUNT_AMOUNT')) return { kind: 'invalid', flow, reason: 'amount' };
    if (field === 'currency' && !/^[A-Z]{3}$/u.test(text.toUpperCase())) return { kind: 'invalid', flow, reason: 'currency' };
    if (field !== 'amount' && field !== 'currency' && (!text || text.length > 240)) return { kind: 'invalid', flow, reason: 'text' };
    return this.move(row.id, flow, this.next(row.step, flow), { ...payload, [field]: field === 'amount' ? text.replace(',', '.') : field === 'currency' ? text.toUpperCase() : text });
  }
  async consumeCallback(input: FinanceFlowInput & { callback: FinanceFlowCallback }): Promise<FinanceFlowResult> {
    const row = await this.active(input); if (!row) return null;
    const flow = row.operationKind as FinanceFlowKind, payload = this.payload(row.payload), callback = input.callback;
    if (row.status === 'EXPIRED') return { kind: 'expired', flow };
    if (payload.revision && callback.revision !== payload.revision) return { kind: 'invalid', flow, reason: 'selection' };
    if (row.status === 'CREATING' && callback.action !== 'confirm') return null;
    if (callback.action === 'cancel') return this.cancelFlow(input);
    if (callback.action === 'back') { const step = this.previous(row.step, flow); return step ? this.move(row.id, flow, step, payload) : { kind: 'invalid', flow, reason: 'selection' }; }
    if (callback.action === 'confirm') return this.confirm(input, row, flow, payload);
    if (callback.action === 'page') {
      const page = Number(callback.id);
      return Number.isInteger(page) && page >= 0
        ? { ...this.result(flow, row.step, payload)!, page }
        : { kind: 'invalid', flow, reason: 'selection' };
    }
    if (callback.action === 'skip') {
      if (!['TRANSACTION_DESCRIPTION', 'TRANSACTION_CATEGORY', 'CATEGORY_PARENT', 'TRANSFER_DESCRIPTION'].includes(row.step)) return { kind: 'invalid', flow, reason: 'selection' };
      const key = row.step === 'TRANSACTION_CATEGORY' ? 'categoryId' : row.step === 'CATEGORY_PARENT' ? 'parentId' : 'description';
      return this.move(row.id, flow, this.next(row.step, flow), { ...payload, [key]: null });
    }
    const expected: Record<string, string> = { TRANSACTION_ACCOUNT: 'account', TRANSACTION_CATEGORY: 'category', ACCOUNT_TYPE: 'type', ACCOUNT_CURRENCY: 'currency', CATEGORY_TYPE: 'type', CATEGORY_PARENT: 'parent', TRANSFER_FROM: 'account', TRANSFER_TO: 'account', SETTINGS_LANGUAGE: 'language' };
    if (expected[row.step] !== callback.action || !('id' in callback) || !this.valid(callback)) return { kind: 'invalid', flow, reason: callback.action === 'currency' ? 'currency' : 'selection' };
    if (!(await this.selectionExists(input.profileId, row.step, callback.id, payload)))
      return { kind: 'invalid', flow, reason: 'selection' };
    const key = callback.action === 'account' ? (row.step === 'TRANSFER_FROM' ? 'fromAccountId' : row.step === 'TRANSFER_TO' ? 'toAccountId' : 'accountId') : callback.action === 'category' ? 'categoryId' : callback.action === 'parent' ? 'parentId' : callback.action === 'language' ? 'locale' : callback.action;
    return this.move(row.id, flow, this.next(row.step, flow), { ...payload, [key]: callback.id });
  }

  currencyKeyboard() { return [COMMON_CURRENCIES.slice(0, 2).map((text) => ({ text })), COMMON_CURRENCIES.slice(2).map((text) => ({ text }))]; }

  /** Bounded read models used only while rendering the current incoming update. */
  async choices(profileId: string, result: Extract<FinanceFlowResult, { kind: 'prompt' | 'review' }>, page = 0) {
    const skip = Math.max(0, page) * 10;
    if (['TRANSACTION_ACCOUNT', 'TRANSFER_FROM', 'TRANSFER_TO'].includes(result.step))
      return (await this.prisma.financeAccount.findMany({
        where: { profileId, archivedAt: null, ...(result.step === 'TRANSFER_TO' && result.payload.fromAccountId ? { id: { not: result.payload.fromAccountId } } : {}) },
        select: { id: true, name: true, currency: true }, orderBy: { createdAt: 'asc' }, skip, take: 11,
      }))
        .map((account) => ({ id: account.id, label: `${account.name} · ${account.currency}` }));
    if (result.step === 'TRANSACTION_CATEGORY')
      return (await this.prisma.financeCategory.findMany({ where: { profileId, archivedAt: null, type: result.payload.type as 'INCOME' | 'EXPENSE' }, select: { id: true, name: true }, orderBy: { name: 'asc' }, skip, take: 11 }))
        .map((category) => ({ id: category.id, label: category.name }));
    if (result.step === 'CATEGORY_PARENT')
      return (await this.prisma.financeCategory.findMany({ where: { profileId, archivedAt: null, type: result.payload.type as 'INCOME' | 'EXPENSE', ...(result.payload.entityId ? { id: { not: result.payload.entityId } } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' }, skip, take: 11 }))
        .map((category) => ({ id: category.id, label: category.name }));
    return [];
  }

  async activeAccounts(profileId: string) {
    return this.prisma.financeAccount.findMany({
      where: { profileId, archivedAt: null },
      select: { id: true, name: true, currency: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
  }

  async reviewLabels(profileId: string, payload: Payload): Promise<{
    accounts: Array<{ id: string; name: string; currency: string; archivedAt: Date | null }>;
    category: { id: string; name: string; key: string | null; archivedAt: Date | null } | null;
  }> {
    const ids = [payload.accountId, payload.fromAccountId, payload.toAccountId].filter((id): id is string => Boolean(id));
    const [accounts, category] = await Promise.all([
      ids.length ? this.prisma.financeAccount.findMany({ where: { profileId, id: { in: ids } }, select: { id: true, name: true, currency: true, archivedAt: true } }) : [],
      payload.categoryId ? this.prisma.financeCategory.findFirst({ where: { profileId, id: payload.categoryId }, select: { id: true, name: true, key: true, archivedAt: true } }) : null,
    ]);
    return { accounts, category };
  }

  private async confirm(input: FinanceFlowInput, row: { id: string; step: string; status?: string }, flow: FinanceFlowKind, payload: Payload): Promise<FinanceFlowResult> {
    if (!row.step.endsWith('_REVIEW')) return { kind: 'invalid', flow, reason: 'selection' };
    if (row.status !== 'CREATING') {
      const claimed = await this.prisma.financeChatFlow.updateMany({ where: { id: row.id, status: 'ACTIVE', step: row.step }, data: { status: 'CREATING' } }); if (!claimed.count) return null;
    }
    try {
      const id = await this.write(input.profileId, flow, payload);
      await this.prisma.financeChatFlow.updateMany({ where: { id: row.id, status: 'CREATING' }, data: { status: 'COMPLETED', step: `${flow}_COMPLETED`, payload: { ...payload, resultId: id } } });
      return { kind: flow.endsWith('EDIT') || flow === 'CATEGORY_ARCHIVE' || flow === 'SETTINGS_LANGUAGE' ? 'updated' : 'created', flow, id, payload };
    } catch (error) { await this.prisma.financeChatFlow.updateMany({ where: { id: row.id, status: 'CREATING' }, data: { status: 'ACTIVE', expiresAt: this.expiresAt() } }); throw error; }
  }
  private async write(profileId: string, flow: FinanceFlowKind, p: Payload): Promise<string> {
    const resultId = p.resultId || randomUUID();
    if (flow === 'ACCOUNT_CREATE') {
      const existing = await this.prisma.financeAccount.findFirst({ where: { id: resultId, profileId }, select: { id: true } });
      return existing?.id || (await this.core.createAccount(profileId, { name: p.name!, type: p.type as 'CASH' | 'CARD' | 'SAVINGS' | 'OTHER', currency: p.currency || undefined, openingBalance: p.amount || '0' }, resultId)).id;
    }
    if (flow === 'ACCOUNT_EDIT') return (await this.core.updateAccount(profileId, p.entityId!, { ...(p.name ? { name: p.name } : {}), ...(p.type ? { type: p.type as 'CASH' | 'CARD' | 'SAVINGS' | 'OTHER' } : {}) })).id;
    if (flow === 'CATEGORY_CREATE') {
      const existing = await this.prisma.financeCategory.findFirst({ where: { id: resultId, profileId }, select: { id: true } });
      return existing?.id || (await this.core.createCategory(profileId, { name: p.name!, type: p.type as 'INCOME' | 'EXPENSE', parentId: p.parentId || undefined }, resultId)).id;
    }
    if (flow === 'CATEGORY_EDIT') return (await this.core.updateCategory(profileId, p.entityId!, { name: p.name!, type: p.type as 'INCOME' | 'EXPENSE', parentId: p.parentId || null })).id;
    if (flow === 'CATEGORY_ARCHIVE') {
      const existing = await this.prisma.financeCategory.findFirst({ where: { id: p.entityId!, profileId }, select: { id: true, archivedAt: true } });
      if (existing?.archivedAt) return existing.id;
      return (await this.core.archiveCategory(profileId, p.entityId!)).id;
    }
    if (flow === 'TRANSFER_CREATE') {
      const existing = await this.prisma.financeTransfer.findFirst({ where: { id: resultId, profileId }, select: { id: true } });
      return existing?.id || (await this.requireTransfers().create(profileId, { fromAccountId: p.fromAccountId!, toAccountId: p.toAccountId!, amount: p.amount!, occurredAt: p.occurredAt!, description: p.description || undefined }, resultId)).id;
    }
    if (flow === 'SETTINGS_LANGUAGE') { const profile = await this.core.profile(profileId); if (!profile) throw new Error('Finance profile not found'); await this.core.updateSettings(profileId, { defaultCurrency: profile.defaultCurrency, timezone: profile.timezone, locale: p.locale as 'uk' | 'ru' | 'en' }); return profileId; }
    const existing = await this.prisma.financeTransaction.findFirst({ where: { id: resultId, profileId }, select: { id: true } });
    if (existing) return existing.id;
    const ledger = this.requireLedger(), profile = await ledger.profileContext(profileId);
    return (await ledger.createTransaction(profile, { type: p.type as 'INCOME' | 'EXPENSE', accountId: p.accountId!, categoryId: p.categoryId || undefined, amount: p.amount!, description: p.description || undefined, occurredAt: p.occurredAt! }, 'CHAT', resultId)).id;
  }
  private async persistStart(input: FinanceFlowInput, operationKind: FinanceFlowKind, step: string, payload: Payload) { await this.prisma.financeChatFlow.upsert({ where: { botIntegrationId_telegramBotUserId: { botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId } }, create: { ...input, operationKind, step, payload, expiresAt: this.expiresAt() }, update: { profileId: input.profileId, operationKind, step, status: 'ACTIVE', payload, expiresAt: this.expiresAt() } }); }
  private async active(input: FinanceFlowInput) { const row = await this.prisma.financeChatFlow.findUnique({ where: { botIntegrationId_telegramBotUserId: { botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId } } }); if (!row || row.profileId !== input.profileId || !['ACTIVE', 'CREATING'].includes(row.status)) return null; if (row.status === 'CREATING' || row.expiresAt > new Date()) return row; await this.prisma.financeChatFlow.update({ where: { id: row.id }, data: { status: 'EXPIRED' } }); return { ...row, status: 'EXPIRED' }; }
  private async move(id: string, flow: FinanceFlowKind, step: string, payload: Payload): Promise<FinanceFlowResult> { await this.prisma.financeChatFlow.update({ where: { id }, data: { step, payload, expiresAt: this.expiresAt() } }); return this.result(flow, step, payload); }
  private result(flow: FinanceFlowKind, step: string, payload: Payload): Extract<FinanceFlowResult, { kind: 'prompt' | 'review' }> { return step.endsWith('_REVIEW') ? { kind: 'review', flow, step, payload } : { kind: 'prompt', flow, step, payload }; }
  private initial(flow: FinanceFlowKind) { return ({ TRANSACTION_CREATE: 'TRANSACTION_DESCRIPTION', ACCOUNT_CREATE: 'ACCOUNT_NAME', ACCOUNT_EDIT: 'ACCOUNT_NAME', CATEGORY_CREATE: 'CATEGORY_TYPE', CATEGORY_EDIT: 'CATEGORY_NAME', CATEGORY_ARCHIVE: 'CATEGORY_ARCHIVE_REVIEW', TRANSFER_CREATE: 'TRANSFER_DESCRIPTION', SETTINGS_LANGUAGE: 'SETTINGS_LANGUAGE' } as const)[flow]; }
  private next(step: string, flow: FinanceFlowKind) { if (flow === 'ACCOUNT_EDIT' && step === 'ACCOUNT_TYPE') return 'ACCOUNT_REVIEW'; return ({ TRANSACTION_DESCRIPTION: 'TRANSACTION_ACCOUNT', TRANSACTION_ACCOUNT: 'TRANSACTION_AMOUNT', TRANSACTION_AMOUNT: 'TRANSACTION_CATEGORY', TRANSACTION_CATEGORY: 'TRANSACTION_REVIEW', ACCOUNT_NAME: 'ACCOUNT_TYPE', ACCOUNT_TYPE: 'ACCOUNT_CURRENCY', ACCOUNT_CURRENCY: 'ACCOUNT_AMOUNT', ACCOUNT_AMOUNT: 'ACCOUNT_REVIEW', CATEGORY_TYPE: 'CATEGORY_NAME', CATEGORY_NAME: 'CATEGORY_PARENT', CATEGORY_PARENT: 'CATEGORY_REVIEW', TRANSFER_DESCRIPTION: 'TRANSFER_FROM', TRANSFER_FROM: 'TRANSFER_TO', TRANSFER_TO: 'TRANSFER_AMOUNT', TRANSFER_AMOUNT: 'TRANSFER_REVIEW', SETTINGS_LANGUAGE: 'SETTINGS_REVIEW' } as Record<string, string>)[step] || step; }
  private previous(step: string, flow: FinanceFlowKind) { if (flow === 'ACCOUNT_EDIT' && step === 'ACCOUNT_REVIEW') return 'ACCOUNT_TYPE'; return ({ TRANSACTION_ACCOUNT: 'TRANSACTION_DESCRIPTION', TRANSACTION_AMOUNT: 'TRANSACTION_ACCOUNT', TRANSACTION_CATEGORY: 'TRANSACTION_AMOUNT', TRANSACTION_REVIEW: 'TRANSACTION_CATEGORY', ACCOUNT_TYPE: 'ACCOUNT_NAME', ACCOUNT_CURRENCY: 'ACCOUNT_TYPE', ACCOUNT_AMOUNT: 'ACCOUNT_CURRENCY', ACCOUNT_REVIEW: 'ACCOUNT_AMOUNT', CATEGORY_NAME: 'CATEGORY_TYPE', CATEGORY_PARENT: 'CATEGORY_NAME', CATEGORY_REVIEW: 'CATEGORY_PARENT', TRANSFER_FROM: 'TRANSFER_DESCRIPTION', TRANSFER_TO: 'TRANSFER_FROM', TRANSFER_AMOUNT: 'TRANSFER_TO', TRANSFER_REVIEW: 'TRANSFER_AMOUNT', SETTINGS_REVIEW: 'SETTINGS_LANGUAGE' } as Record<string, string>)[step]; }
  private field(step: string) { return ({ TRANSACTION_DESCRIPTION: 'description', TRANSACTION_AMOUNT: 'amount', ACCOUNT_NAME: 'name', ACCOUNT_AMOUNT: 'amount', CATEGORY_NAME: 'name', TRANSFER_DESCRIPTION: 'description', TRANSFER_AMOUNT: 'amount' } as Record<string, string>)[step]; }
  private valid(value: Exclude<FinanceFlowCallback, { action: 'back' | 'cancel' | 'confirm' | 'skip' }>) { return value.action !== 'type' || ['CASH', 'CARD', 'SAVINGS', 'OTHER', 'INCOME', 'EXPENSE'].includes(value.id) ? value.action !== 'language' || ['uk', 'ru', 'en'].includes(value.id) : false; }
  private async selectionExists(profileId: string, step: string, id: string, payload: Payload) {
    if (['TRANSACTION_ACCOUNT', 'TRANSFER_FROM', 'TRANSFER_TO'].includes(step)) {
      if (step === 'TRANSFER_TO' && id === payload.fromAccountId) return false;
      return Boolean(await this.prisma.financeAccount.findFirst({ where: { id, profileId, archivedAt: null }, select: { id: true } }));
    }
    if (step === 'TRANSACTION_CATEGORY' || step === 'CATEGORY_PARENT')
      return Boolean(await this.prisma.financeCategory.findFirst({ where: { id, profileId, archivedAt: null, type: payload.type as 'INCOME' | 'EXPENSE', ...(step === 'CATEGORY_PARENT' && payload.entityId ? { id: { not: payload.entityId } } : {}) }, select: { id: true } }));
    return true;
  }
  private payload(value: unknown): Payload { return (value && typeof value === 'object' ? value : {}) as Payload; }
  private amount(value: string, allowZero = false) { const amount = Number(value.replace(',', '.')); return /^\d{1,12}(?:[.,]\d{1,2})?$/u.test(value) && Number.isFinite(amount) && amount >= (allowZero ? 0 : Number.EPSILON); }
  private requireLedger() { if (!this.ledger) throw new Error('FinanceLedgerService is required'); return this.ledger; }
  private requireTransfers() { if (!this.transfers) throw new Error('FinanceTransferService is required'); return this.transfers; }
  private expiresAt() { return new Date(Date.now() + FLOW_TTL_MS); }
  private revision() { return randomBytes(4).toString('hex'); }
  private legacy(result: FinanceFlowResult): AccountFlowResult { if (!result) return null; if (result.kind === 'cancelled') return { kind: 'cancelled' }; if (result.kind === 'invalid' && result.flow === 'ACCOUNT_CREATE') return { kind: result.reason === 'currency' ? 'invalid-currency' : result.reason === 'amount' ? 'invalid-balance' : 'invalid-name' }; if (result.kind === 'prompt' && result.flow === 'ACCOUNT_CREATE') return result.step === 'ACCOUNT_CURRENCY' ? { kind: 'currency', name: result.payload.name || '' } : result.step === 'ACCOUNT_AMOUNT' ? { kind: 'balance' } : { kind: 'name' }; return null; }
}
