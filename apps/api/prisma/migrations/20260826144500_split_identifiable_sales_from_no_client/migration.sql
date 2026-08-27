-- Some legacy named sales were linked to the shared generic Advertiser row.
-- Split any sale with a concrete Telegram identity into its own CRM client.
WITH candidates AS (
  SELECT DISTINCT ON (s."workspaceId", identity."displayName")
    s."workspaceId",
    identity."displayName",
    identity."telegramUsername",
    NULLIF(BTRIM(s."advertiserCompanySnapshot"), '') AS "companyName",
    s."assignedMemberId" AS "ownerMemberId",
    s."createdByUserId",
    s."createdAt"
  FROM "TelegramAdSale" s
  JOIN "TelegramAdvertiser" current_client ON current_client."id" = s."advertiserId"
  CROSS JOIN LATERAL (
    SELECT
      NULLIF(LTRIM(BTRIM(COALESCE(
        s."advertiserTelegramSnapshot",
        s."advertiserTelegram",
        s."advertiserContact",
        CASE WHEN COALESCE(s."advertiserNameSnapshot", s."advertiserName") LIKE '@%'
          THEN COALESCE(s."advertiserNameSnapshot", s."advertiserName") END
      )), '@'), '') AS "displayName",
      LOWER(NULLIF(LTRIM(BTRIM(COALESCE(
        s."advertiserTelegramSnapshot",
        s."advertiserTelegram",
        CASE WHEN COALESCE(s."advertiserNameSnapshot", s."advertiserName") LIKE '@%'
          THEN COALESCE(s."advertiserNameSnapshot", s."advertiserName") END
      )), '@'), '')) AS "telegramUsername"
  ) identity
  WHERE LOWER(BTRIM(current_client."displayName")) IN
    ('advertiser', 'direct sale', 'telegram advertiser', 'no client')
    AND current_client."telegramUsername" IS NULL
    AND identity."displayName" IS NOT NULL
  ORDER BY s."workspaceId", identity."displayName", s."createdAt"
)
INSERT INTO "TelegramAdvertiser" (
  "id", "workspaceId", "displayName", "companyName", "telegramUsername",
  "status", "lifecycleStage", "ownerMemberId", "createdByUserId",
  "createdAt", "updatedAt"
)
SELECT
  'split_' || MD5(c."workspaceId" || ':' || LOWER(c."displayName")),
  c."workspaceId", c."displayName", c."companyName", c."telegramUsername",
  'ACTIVE'::"TelegramAdvertiserStatus",
  'CUSTOMER'::"TelegramAdvertiserLifecycleStage",
  c."ownerMemberId", c."createdByUserId", c."createdAt", NOW()
FROM candidates c
ON CONFLICT ("workspaceId", "displayName") DO UPDATE SET
  "telegramUsername" = COALESCE("TelegramAdvertiser"."telegramUsername", EXCLUDED."telegramUsername"),
  "updatedAt" = NOW();

WITH identifiable_sales AS (
  SELECT
    s."id" AS "saleId",
    s."workspaceId",
    NULLIF(LTRIM(BTRIM(COALESCE(
      s."advertiserTelegramSnapshot",
      s."advertiserTelegram",
      s."advertiserContact",
      CASE WHEN COALESCE(s."advertiserNameSnapshot", s."advertiserName") LIKE '@%'
        THEN COALESCE(s."advertiserNameSnapshot", s."advertiserName") END
    )), '@'), '') AS "displayName"
  FROM "TelegramAdSale" s
  JOIN "TelegramAdvertiser" current_client ON current_client."id" = s."advertiserId"
  WHERE LOWER(BTRIM(current_client."displayName")) IN
    ('advertiser', 'direct sale', 'telegram advertiser', 'no client')
    AND current_client."telegramUsername" IS NULL
)
UPDATE "TelegramAdSale" s
SET "advertiserId" = target."id"
FROM identifiable_sales identity
JOIN "TelegramAdvertiser" target
  ON target."workspaceId" = identity."workspaceId"
 AND LOWER(target."displayName") = LOWER(identity."displayName")
WHERE s."id" = identity."saleId"
  AND identity."displayName" IS NOT NULL;
