-- A fully paid order is already a customer relationship even if its sale workflow
-- has not yet advanced from DRAFT/RESERVED to a delivery status.
WITH "salePayments" AS (
  SELECT
    s."id" AS "saleId",
    s."advertiserId",
    s."createdAt",
    COALESCE((
      SELECT SUM(p."agreedPrice")
      FROM "TelegramAdSalePlacement" p
      WHERE p."telegramAdSaleId" = s."id"
    ), 0) AS "agreedTotal",
    COALESCE((
      SELECT SUM(pay."amount")
      FROM "TelegramAdSalePayment" pay
      WHERE pay."telegramAdSaleId" = s."id"
        AND pay."status" <> 'VOIDED'::"TelegramAdSalePaymentStatus"
    ), 0) AS "paidTotal"
  FROM "TelegramAdSale" s
  WHERE s."advertiserId" IS NOT NULL
    AND s."status" <> 'CANCELLED'::"TelegramAdSaleStatus"
),
"customerStats" AS (
  SELECT
    "advertiserId",
    COUNT(*)::integer AS "customerSalesCount",
    MIN("createdAt") AS "firstPurchaseAt",
    MAX("createdAt") AS "lastPurchaseAt"
  FROM "salePayments"
  WHERE "agreedTotal" > 0
    AND "paidTotal" >= "agreedTotal"
  GROUP BY "advertiserId"
)
UPDATE "TelegramAdvertiser" a
SET
  "status" = 'ACTIVE'::"TelegramAdvertiserStatus",
  "lifecycleStage" = CASE
    WHEN stats."customerSalesCount" >= 2
      THEN 'REPEAT_CUSTOMER'::"TelegramAdvertiserLifecycleStage"
    ELSE 'CUSTOMER'::"TelegramAdvertiserLifecycleStage"
  END,
  "firstPurchaseAt" = COALESCE(a."firstPurchaseAt", stats."firstPurchaseAt"),
  "lastPurchaseAt" = GREATEST(a."lastPurchaseAt", stats."lastPurchaseAt"),
  "updatedAt" = NOW()
FROM "customerStats" stats
WHERE a."id" = stats."advertiserId"
  AND a."status" NOT IN (
    'LOST'::"TelegramAdvertiserStatus",
    'BLOCKED'::"TelegramAdvertiserStatus",
    'ARCHIVED'::"TelegramAdvertiserStatus"
  );
