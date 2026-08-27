-- Re-run CRM materialization for identifiable historical sales created after
-- the original backfill was deployed. Anonymous "Advertiser" sales remain in
-- the No client bucket unless a Telegram username/contact identifies them.
WITH candidates AS (
  SELECT DISTINCT ON (s."workspaceId", identity."displayName")
    s."workspaceId",
    identity."displayName",
    NULLIF(BTRIM(s."advertiserCompanySnapshot"), '') AS "companyName",
    LOWER(LTRIM(NULLIF(BTRIM(COALESCE(
      s."advertiserTelegramSnapshot",
      s."advertiserTelegram",
      CASE WHEN COALESCE(s."advertiserNameSnapshot", s."advertiserName") LIKE '@%'
        THEN COALESCE(s."advertiserNameSnapshot", s."advertiserName") END
    )), ''), '@')) AS "telegramUsername",
    s."assignedMemberId" AS "ownerMemberId",
    s."createdByUserId",
    s."createdAt"
  FROM "TelegramAdSale" s
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN LOWER(BTRIM(COALESCE(s."advertiserNameSnapshot", s."advertiserName"))) IN
        ('advertiser', 'direct sale', 'telegram advertiser', 'no client')
      THEN COALESCE(
        NULLIF(LTRIM(BTRIM(COALESCE(s."advertiserTelegramSnapshot", s."advertiserTelegram")), '@'), ''),
        NULLIF(BTRIM(s."advertiserCompanySnapshot"), ''),
        NULLIF(BTRIM(s."advertiserContact"), '')
      )
      ELSE NULLIF(LTRIM(BTRIM(COALESCE(s."advertiserNameSnapshot", s."advertiserName")), '@'), '')
    END AS "displayName"
  ) identity
  WHERE s."advertiserId" IS NULL
    AND identity."displayName" IS NOT NULL
  ORDER BY s."workspaceId", identity."displayName", s."createdAt"
)
INSERT INTO "TelegramAdvertiser" (
  "id", "workspaceId", "displayName", "companyName", "telegramUsername",
  "status", "lifecycleStage", "ownerMemberId", "createdByUserId",
  "createdAt", "updatedAt"
)
SELECT
  'backfill2_' || MD5(c."workspaceId" || ':' || c."displayName"),
  c."workspaceId", c."displayName", c."companyName", c."telegramUsername",
  'LEAD'::"TelegramAdvertiserStatus",
  'NEW'::"TelegramAdvertiserLifecycleStage",
  c."ownerMemberId", c."createdByUserId", c."createdAt", NOW()
FROM candidates c
ON CONFLICT ("workspaceId", "displayName") DO UPDATE SET
  "telegramUsername" = COALESCE("TelegramAdvertiser"."telegramUsername", EXCLUDED."telegramUsername"),
  "companyName" = COALESCE("TelegramAdvertiser"."companyName", EXCLUDED."companyName"),
  "updatedAt" = NOW();

WITH identities AS (
  SELECT
    s."id" AS "saleId",
    s."workspaceId",
    CASE
      WHEN LOWER(BTRIM(COALESCE(s."advertiserNameSnapshot", s."advertiserName"))) IN
        ('advertiser', 'direct sale', 'telegram advertiser', 'no client')
      THEN COALESCE(
        NULLIF(LTRIM(BTRIM(COALESCE(s."advertiserTelegramSnapshot", s."advertiserTelegram")), '@'), ''),
        NULLIF(BTRIM(s."advertiserCompanySnapshot"), ''),
        NULLIF(BTRIM(s."advertiserContact"), '')
      )
      ELSE NULLIF(LTRIM(BTRIM(COALESCE(s."advertiserNameSnapshot", s."advertiserName")), '@'), '')
    END AS "displayName"
  FROM "TelegramAdSale" s
  WHERE s."advertiserId" IS NULL
)
UPDATE "TelegramAdSale" s
SET "advertiserId" = a."id"
FROM identities i
JOIN "TelegramAdvertiser" a
  ON a."workspaceId" = i."workspaceId"
 AND LOWER(a."displayName") = LOWER(i."displayName")
WHERE s."id" = i."saleId"
  AND i."displayName" IS NOT NULL;
