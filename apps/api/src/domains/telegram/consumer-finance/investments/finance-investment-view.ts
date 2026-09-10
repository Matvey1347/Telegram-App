import { Prisma } from '@prisma/client';
import {
  financeAccountEmoji,
  financeIconPresentation,
} from '../catalog/finance-entity-emoji';
import {
  financeTransactionSelect,
  financeTransactionView,
} from '../ledger/finance-transaction-view';

export const financeInvestmentSelect = {
  id: true,
  name: true,
  description: true,
  type: true,
  currency: true,
  status: true,
  startedAt: true,
  closedAt: true,
  archivedAt: true,
  totalInvested: true,
  totalReturned: true,
  currentValue: true,
  currentValuationAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FinanceInvestmentSelect;

export const financeInvestmentCashFlowSelect = {
  id: true,
  investmentId: true,
  kind: true,
  accountId: true,
  transactionId: true,
  amountInInvestmentCurrency: true,
  occurredAt: true,
  note: true,
  createdAt: true,
  account: {
    select: { id: true, name: true, currency: true, type: true, emoji: true },
  },
  investment: { select: { currency: true } },
  transaction: { select: financeTransactionSelect },
} satisfies Prisma.FinanceInvestmentCashFlowSelect;

export const financeInvestmentValuationSelect = {
  id: true,
  investmentId: true,
  value: true,
  currency: true,
  valuedAt: true,
  correctsValuationId: true,
  correctedBy: { select: { id: true } },
  note: true,
  createdAt: true,
} satisfies Prisma.FinanceInvestmentValuationSelect;

type InvestmentRow = Prisma.FinanceInvestmentGetPayload<{
  select: typeof financeInvestmentSelect;
}>;
type CashFlowRow = Prisma.FinanceInvestmentCashFlowGetPayload<{
  select: typeof financeInvestmentCashFlowSelect;
}>;
type ValuationRow = Prisma.FinanceInvestmentValuationGetPayload<{
  select: typeof financeInvestmentValuationSelect;
}>;

export function financeInvestmentView(row: InvestmentRow) {
  const invested = new Prisma.Decimal(row.totalInvested);
  const returned = new Prisma.Decimal(row.totalReturned);
  const current = new Prisma.Decimal(row.currentValue);
  const profitLoss = current.plus(returned).minus(invested);
  return {
    ...row,
    totalInvested: invested.toString(),
    totalReturned: returned.toString(),
    currentValue: current.toString(),
    profitLoss: profitLoss.toString(),
    returnPercentage: invested.isZero()
      ? null
      : Number(profitLoss.div(invested).mul(100).toDecimalPlaces(2)),
  };
}

export function financeInvestmentCashFlowView(row: CashFlowRow) {
  return {
    id: row.id,
    investmentId: row.investmentId,
    kind: row.kind,
    accountId: row.accountId,
    account: {
      id: row.account.id,
      name: row.account.name,
      currency: row.account.currency,
      iconPresentation: financeIconPresentation(
        row.account.emoji,
        financeAccountEmoji(row.account.type),
      ),
    },
    transactionId: row.transactionId,
    transaction: financeTransactionView(row.transaction),
    amount: row.transaction.amount.toString(),
    currency: row.transaction.currency,
    amountInInvestmentCurrency: row.amountInInvestmentCurrency.toString(),
    investmentCurrency: row.investment.currency,
    occurredAt: row.occurredAt,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export function financeInvestmentValuationView(row: ValuationRow) {
  const { correctedBy, ...valuation } = row;
  return {
    ...valuation,
    correctedByValuationId: correctedBy?.id || null,
    value: row.value.toString(),
  };
}
