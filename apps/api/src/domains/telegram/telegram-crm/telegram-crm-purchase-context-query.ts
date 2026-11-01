import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CrmCurrencyAmount,
  CrmPurchaseSummary,
} from '@telegram-system/shared';

export type PurchaseScope = {
  workspaceId: string;
  contactId: string;
  assignedMemberId?: string;
};
export type PurchaseAmountRow = {
  saleId: string | null;
  kind: 'received' | 'agreed';
  currency: string;
  amount: string;
};
const PAGE_AMOUNT_ROWS = 5000;
const SUMMARY_AMOUNT_ROWS = 500;

function predicate(scope: PurchaseScope, ids?: readonly string[]) {
  return Prisma.join(
    [
      Prisma.sql`sale."workspaceId" = ${scope.workspaceId}`,
      Prisma.sql`sale."advertiserId" = ${scope.contactId}`,
      ...(scope.assignedMemberId
        ? [Prisma.sql`sale."assignedMemberId" = ${scope.assignedMemberId}`]
        : []),
      ...(ids ? [Prisma.sql`sale."id" IN (${Prisma.join(ids)})`] : []),
    ],
    ' AND ',
  );
}

/** Currency belongs to each payment/placement, never to the sale settlement label. */
export async function purchaseAmounts(
  tx: Prisma.TransactionClient,
  scope: PurchaseScope,
  ids?: readonly string[],
) {
  if (ids && !ids.length) return [];
  const maxRows = ids ? PAGE_AMOUNT_ROWS : SUMMARY_AMOUNT_ROWS;
  const groupedId = ids ? Prisma.sql`sale."id"` : Prisma.sql`NULL::text`;
  const rows = await tx.$queryRaw<PurchaseAmountRow[]>(Prisma.sql`
    SELECT ${groupedId} AS "saleId", 'received'::text AS kind,
      UPPER(TRIM(payment."currency")) AS currency, SUM(payment."amount")::text AS amount
    FROM "TelegramAdSale" sale JOIN "TelegramAdSalePayment" payment
      ON payment."telegramAdSaleId" = sale."id" AND payment."workspaceId" = sale."workspaceId"
    WHERE ${predicate(scope, ids)} AND payment."status" <> 'VOIDED'::"TelegramAdSalePaymentStatus"
    GROUP BY ${ids ? Prisma.sql`sale."id",` : Prisma.empty} UPPER(TRIM(payment."currency"))
    UNION ALL
    SELECT ${groupedId} AS "saleId", 'agreed'::text AS kind,
      UPPER(TRIM(placement."currency")) AS currency, SUM(placement."agreedPrice")::text AS amount
    FROM "TelegramAdSale" sale JOIN "TelegramAdSalePlacement" placement
      ON placement."telegramAdSaleId" = sale."id" AND placement."workspaceId" = sale."workspaceId"
    WHERE ${predicate(scope, ids)}
      ${ids ? Prisma.empty : Prisma.sql`AND sale."status" NOT IN ('DRAFT'::"TelegramAdSaleStatus", 'CANCELLED'::"TelegramAdSaleStatus")`}
    GROUP BY ${ids ? Prisma.sql`sale."id",` : Prisma.empty} UPPER(TRIM(placement."currency"))
    LIMIT ${maxRows + 1}
  `);
  if (rows.length > maxRows)
    throw new BadRequestException(
      'Too many currency groups; narrow purchase history or repair currency data',
    );
  return rows;
}

export function amountsFor(
  rows: PurchaseAmountRow[],
  kind: PurchaseAmountRow['kind'],
  saleId: string | null,
): CrmCurrencyAmount[] {
  return rows
    .filter((row) => row.kind === kind && row.saleId === saleId)
    .map(({ currency, amount }) => ({
      currency,
      amount: new Prisma.Decimal(amount).toFixed(),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Constant-size aggregate result even when the linked purchase history grows. */
export async function purchaseSummary(
  tx: Prisma.TransactionClient,
  scope: PurchaseScope,
): Promise<CrmPurchaseSummary> {
  const [stats, amounts] = await Promise.all([
    tx.$queryRaw<
      Array<{
        dealCount: number;
        purchaseCount: number;
        lastPurchaseAt: Date | null;
      }>
    >(Prisma.sql`
      SELECT COUNT(*)::int AS "dealCount", COUNT(*) FILTER (WHERE purchased)::int AS "purchaseCount",
        MAX("createdAt") FILTER (WHERE purchased) AS "lastPurchaseAt"
      FROM (
        SELECT sale."createdAt", sale."status" NOT IN ('DRAFT'::"TelegramAdSaleStatus", 'CANCELLED'::"TelegramAdSaleStatus")
          AND (sale."status" = 'COMPLETED'::"TelegramAdSaleStatus" OR EXISTS (
            SELECT 1 FROM "TelegramAdSalePayment" payment
            WHERE payment."telegramAdSaleId" = sale."id" AND payment."workspaceId" = sale."workspaceId"
              AND payment."status" <> 'VOIDED'::"TelegramAdSalePaymentStatus" AND payment."amount" > 0
          )) AS purchased
        FROM "TelegramAdSale" sale WHERE ${predicate(scope)}
      ) AS purchases
    `),
    purchaseAmounts(tx, scope),
  ]);
  return {
    dealCount: stats[0]?.dealCount ?? 0,
    purchaseCount: stats[0]?.purchaseCount ?? 0,
    lastPurchaseAt: stats[0]?.lastPurchaseAt?.toISOString() ?? null,
    receivedByCurrency: amountsFor(amounts, 'received', null),
    agreedByCurrency: amountsFor(amounts, 'agreed', null),
    attribution: 'LINKED_SALES_ONLY',
  };
}
