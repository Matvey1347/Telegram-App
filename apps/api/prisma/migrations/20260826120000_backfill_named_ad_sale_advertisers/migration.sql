-- Historical sales could retain a useful advertiser snapshot while lacking the
-- CRM foreign key. Materialize those named clients once; anonymous/default
-- sales deliberately remain unassigned for the "No client" bucket.
WITH "orphanCandidates" AS (
  SELECT DISTINCT ON (s."workspaceId", "identity"."displayName")
    s."workspaceId",
    "identity"."displayName",
    NULLIF(BTRIM(s."advertiserCompanySnapshot"), '') AS "companyName",
    NULLIF(BTRIM(COALESCE(s."advertiserTelegramSnapshot", s."advertiserTelegram")), '') AS "telegramUsername",
    s."assignedMemberId" AS "ownerMemberId",
    s."createdByUserId",
    s."createdAt"
  FROM "TelegramAdSale" s
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN LOWER(BTRIM(COALESCE(s."advertiserNameSnapshot", s."advertiserName"))) IN
        ('advertiser', 'direct sale', 'telegram advertiser', 'no client')
      THEN COALESCE(
        NULLIF(BTRIM(s."advertiserCompanySnapshot"), ''),
        NULLIF(BTRIM(COALESCE(s."advertiserTelegramSnapshot", s."advertiserTelegram")), ''),
        NULLIF(BTRIM(s."advertiserContact"), '')
      )
      WHEN BTRIM(COALESCE(s."advertiserNameSnapshot", s."advertiserName")) LIKE '@%'
      THEN NULLIF(LTRIM(BTRIM(COALESCE(
        s."advertiserTelegramSnapshot",
        s."advertiserTelegram",
        s."advertiserNameSnapshot",
        s."advertiserName"
      )), '@'), '')
      ELSE NULLIF(BTRIM(COALESCE(s."advertiserNameSnapshot", s."advertiserName")), '')
    END AS "displayName"
  ) "identity"
  WHERE s."advertiserId" IS NULL
    AND "identity"."displayName" IS NOT NULL
  ORDER BY s."workspaceId", "identity"."displayName", s."createdAt"
)
INSERT INTO "TelegramAdvertiser" (
  "id",
  "workspaceId",
  "displayName",
  "companyName",
  "telegramUsername",
  "status",
  "lifecycleStage",
  "ownerMemberId",
  "createdByUserId",
  "createdAt",
  "updatedAt"
)
SELECT
  'backfill_' || MD5(c."workspaceId" || ':' || c."displayName"),
  c."workspaceId",
  c."displayName",
  c."companyName",
  LOWER(LTRIM(c."telegramUsername", '@')),
  'LEAD'::"TelegramAdvertiserStatus",
  'NEW'::"TelegramAdvertiserLifecycleStage",
  c."ownerMemberId",
  c."createdByUserId",
  c."createdAt",
  NOW()
FROM "orphanCandidates" c
ON CONFLICT ("workspaceId", "displayName") DO NOTHING;

WITH "identifiableSales" AS (
  SELECT
    s."id" AS "saleId",
    s."workspaceId",
    CASE
      WHEN LOWER(BTRIM(COALESCE(s."advertiserNameSnapshot", s."advertiserName"))) IN
        ('advertiser', 'direct sale', 'telegram advertiser', 'no client')
      THEN COALESCE(
        NULLIF(BTRIM(s."advertiserCompanySnapshot"), ''),
        NULLIF(BTRIM(COALESCE(s."advertiserTelegramSnapshot", s."advertiserTelegram")), ''),
        NULLIF(BTRIM(s."advertiserContact"), '')
      )
      WHEN BTRIM(COALESCE(s."advertiserNameSnapshot", s."advertiserName")) LIKE '@%'
      THEN NULLIF(LTRIM(BTRIM(COALESCE(
        s."advertiserTelegramSnapshot",
        s."advertiserTelegram",
        s."advertiserNameSnapshot",
        s."advertiserName"
      )), '@'), '')
      ELSE NULLIF(BTRIM(COALESCE(s."advertiserNameSnapshot", s."advertiserName")), '')
    END AS "displayName"
  FROM "TelegramAdSale" s
  WHERE s."advertiserId" IS NULL
)
UPDATE "TelegramAdSale" s
SET "advertiserId" = a."id"
FROM "identifiableSales" i
JOIN "TelegramAdvertiser" a
  ON a."workspaceId" = i."workspaceId"
 AND a."displayName" = i."displayName"
WHERE s."id" = i."saleId"
  AND i."displayName" IS NOT NULL;

WITH "saleStats" AS (
  SELECT
    a."id" AS "advertiserId",
    COUNT(DISTINCT s."id")::INTEGER AS "totalSalesCount",
    COUNT(DISTINCT s."id") FILTER (
      WHERE s."status" IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
    )::INTEGER AS "completedSalesCount",
    COUNT(p."id")::INTEGER AS "totalPlacementsCount",
    COALESCE(MIN(s."createdAt") FILTER (
      WHERE s."status" IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
    ), NULL) AS "firstPurchaseAt",
    COALESCE(MAX(s."createdAt") FILTER (
      WHERE s."status" IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
    ), NULL) AS "lastPurchaseAt"
  FROM "TelegramAdvertiser" a
  LEFT JOIN "TelegramAdSale" s
    ON s."advertiserId" = a."id"
   AND s."workspaceId" = a."workspaceId"
   AND s."status" <> 'CANCELLED'
  LEFT JOIN "TelegramAdSalePlacement" p ON p."telegramAdSaleId" = s."id"
  GROUP BY a."id"
),
"paymentStats" AS (
  SELECT
    s."advertiserId",
    COALESCE(SUM(pay."amountInPrimaryCurrency"), 0) AS revenue
  FROM "TelegramAdSale" s
  LEFT JOIN "TelegramAdSalePayment" pay
    ON pay."telegramAdSaleId" = s."id"
   AND pay."status" <> 'VOIDED'
  WHERE s."advertiserId" IS NOT NULL
    AND s."status" <> 'CANCELLED'
  GROUP BY s."advertiserId"
)
UPDATE "TelegramAdvertiser" a
SET
  "totalSalesCount" = stats."totalSalesCount",
  "completedSalesCount" = stats."completedSalesCount",
  "totalPlacementsCount" = stats."totalPlacementsCount",
  "totalRevenueInPrimaryCurrency" = COALESCE(pay.revenue, 0),
  "averageOrderValueInPrimaryCurrency" = CASE
    WHEN stats."totalSalesCount" > 0
    THEN COALESCE(pay.revenue, 0) / stats."totalSalesCount"
    ELSE 0
  END,
  "firstPurchaseAt" = stats."firstPurchaseAt",
  "lastPurchaseAt" = stats."lastPurchaseAt",
  "status" = CASE
    WHEN stats."completedSalesCount" > 0 THEN 'ACTIVE'::"TelegramAdvertiserStatus"
    ELSE a."status"
  END,
  "lifecycleStage" = CASE
    WHEN stats."completedSalesCount" >= 2 THEN 'REPEAT_CUSTOMER'::"TelegramAdvertiserLifecycleStage"
    WHEN stats."completedSalesCount" = 1 THEN 'CUSTOMER'::"TelegramAdvertiserLifecycleStage"
    ELSE a."lifecycleStage"
  END,
  "updatedAt" = NOW()
FROM "saleStats" stats
LEFT JOIN "paymentStats" pay ON pay."advertiserId" = stats."advertiserId"
WHERE a."id" = stats."advertiserId"
  AND stats."totalSalesCount" > 0;
