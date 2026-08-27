-- Keep CRM status and lifecycle consistent for advertisers that already have sales.
WITH "saleStats" AS (
  SELECT
    s."advertiserId",
    COUNT(*) FILTER (
      WHERE s."status" IN (
        'CONFIRMED'::"TelegramAdSaleStatus",
        'IN_PROGRESS'::"TelegramAdSaleStatus",
        'COMPLETED'::"TelegramAdSaleStatus"
      )
    )::integer AS "completedSalesCount"
  FROM "TelegramAdSale" s
  WHERE s."advertiserId" IS NOT NULL
    AND s."status" <> 'CANCELLED'::"TelegramAdSaleStatus"
  GROUP BY s."advertiserId"
)
UPDATE "TelegramAdvertiser" a
SET
  "status" = CASE
    WHEN stats."completedSalesCount" > 0
      THEN 'ACTIVE'::"TelegramAdvertiserStatus"
    ELSE a."status"
  END,
  "lifecycleStage" = CASE
    WHEN stats."completedSalesCount" >= 2
      THEN 'REPEAT_CUSTOMER'::"TelegramAdvertiserLifecycleStage"
    WHEN stats."completedSalesCount" = 1
      THEN 'CUSTOMER'::"TelegramAdvertiserLifecycleStage"
    ELSE a."lifecycleStage"
  END,
  "updatedAt" = NOW()
FROM "saleStats" stats
WHERE a."id" = stats."advertiserId"
  AND stats."completedSalesCount" > 0
  AND (
    a."status" = 'LEAD'::"TelegramAdvertiserStatus"
    OR a."lifecycleStage" IN (
      'NEW'::"TelegramAdvertiserLifecycleStage",
      'QUALIFIED'::"TelegramAdvertiserLifecycleStage"
    )
  );
