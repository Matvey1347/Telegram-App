ALTER TABLE "TelegramAdvertiserTag"
ADD COLUMN "systemKey" TEXT;

CREATE UNIQUE INDEX "TelegramAdvertiserTag_workspaceId_systemKey_key"
ON "TelegramAdvertiserTag"("workspaceId", "systemKey");

-- Workflow tags are available in every existing workspace. They remain
-- manually assignable, while their stable keys keep labels out of identity.
INSERT INTO "TelegramAdvertiserTag" (
  "id", "workspaceId", "name", "color", "systemKey", "position", "createdAt", "updatedAt"
)
SELECT
  'crm_tag_' || md5(w."id" || ':' || seed."systemKey"),
  w."id",
  seed."name",
  seed."color",
  seed."systemKey",
  seed."position",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Workspace" w
CROSS JOIN (
  VALUES
    ('WORKFLOW:FOLDER', '📁 Folder', '#f59e0b', 10),
    ('WORKFLOW:MUTUAL_PROMOTION', '🤝 Mutual promotion', '#a78bfa', 20),
    ('WORKFLOW:INBOUND_AD_OFFER', '📨 Inbound ad offer', '#34d399', 30)
) AS seed("systemKey", "name", "color", "position")
ON CONFLICT DO NOTHING;

-- Backfill a channel tag for every historical non-cancelled purchase.
INSERT INTO "TelegramAdvertiserTag" (
  "id", "workspaceId", "name", "color", "systemKey", "position", "createdAt", "updatedAt"
)
SELECT DISTINCT
  'crm_tag_' || md5(s."workspaceId" || ':channel:' || c."id"),
  s."workspaceId",
  'Channel · ' || c."title",
  '#38bdf8',
  'CHANNEL:' || c."id",
  200,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "TelegramAdSale" s
JOIN "TelegramAdSalePlacement" p ON p."telegramAdSaleId" = s."id"
JOIN "TelegramChannel" c ON c."id" = p."telegramChannelId"
WHERE s."advertiserId" IS NOT NULL
  AND s."status"::text IN ('RESERVED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
  AND p."status"::text NOT IN ('CANCELLED', 'MISSED')
ON CONFLICT DO NOTHING;

-- Prefer the network explicitly selected on the placement. If an older
-- placement has no snapshot, use the channel's current network memberships.
INSERT INTO "TelegramAdvertiserTag" (
  "id", "workspaceId", "name", "color", "systemKey", "position", "createdAt", "updatedAt"
)
SELECT DISTINCT
  'crm_tag_' || md5(source."workspaceId" || ':network:' || source."networkId"),
  source."workspaceId",
  'Network · ' || n."name",
  '#60a5fa',
  'NETWORK:' || source."networkId",
  100,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT s."workspaceId", p."telegramChannelNetworkId" AS "networkId"
  FROM "TelegramAdSale" s
  JOIN "TelegramAdSalePlacement" p ON p."telegramAdSaleId" = s."id"
  WHERE s."advertiserId" IS NOT NULL
    AND p."telegramChannelNetworkId" IS NOT NULL
    AND s."status"::text IN ('RESERVED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
    AND p."status"::text NOT IN ('CANCELLED', 'MISSED')
  UNION
  SELECT s."workspaceId", member."networkId"
  FROM "TelegramAdSale" s
  JOIN "TelegramAdSalePlacement" p ON p."telegramAdSaleId" = s."id"
  JOIN "TelegramChannelNetworkMember" member
    ON member."telegramChannelId" = p."telegramChannelId"
   AND member."workspaceId" = s."workspaceId"
  WHERE s."advertiserId" IS NOT NULL
    AND p."telegramChannelNetworkId" IS NULL
    AND s."status"::text IN ('RESERVED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
    AND p."status"::text NOT IN ('CANCELLED', 'MISSED')
) source
JOIN "TelegramChannelNetwork" n
  ON n."id" = source."networkId" AND n."workspaceId" = source."workspaceId"
ON CONFLICT DO NOTHING;

INSERT INTO "TelegramAdvertiserTagAssignment" (
  "advertiserId", "tagId", "workspaceId", "assignedByUserId", "createdAt"
)
SELECT DISTINCT
  s."advertiserId",
  tag."id",
  s."workspaceId",
  NULL,
  CURRENT_TIMESTAMP
FROM "TelegramAdSale" s
JOIN "TelegramAdSalePlacement" p ON p."telegramAdSaleId" = s."id"
JOIN "TelegramAdvertiserTag" tag
  ON tag."workspaceId" = s."workspaceId"
 AND tag."systemKey" = 'CHANNEL:' || p."telegramChannelId"
WHERE s."advertiserId" IS NOT NULL
  AND s."status"::text IN ('RESERVED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
  AND p."status"::text NOT IN ('CANCELLED', 'MISSED')
ON CONFLICT ("advertiserId", "tagId") DO NOTHING;

INSERT INTO "TelegramAdvertiserTagAssignment" (
  "advertiserId", "tagId", "workspaceId", "assignedByUserId", "createdAt"
)
SELECT DISTINCT
  source."advertiserId",
  tag."id",
  source."workspaceId",
  NULL,
  CURRENT_TIMESTAMP
FROM (
  SELECT s."advertiserId", s."workspaceId", p."telegramChannelNetworkId" AS "networkId"
  FROM "TelegramAdSale" s
  JOIN "TelegramAdSalePlacement" p ON p."telegramAdSaleId" = s."id"
  WHERE s."advertiserId" IS NOT NULL
    AND p."telegramChannelNetworkId" IS NOT NULL
    AND s."status"::text IN ('RESERVED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
    AND p."status"::text NOT IN ('CANCELLED', 'MISSED')
  UNION
  SELECT s."advertiserId", s."workspaceId", member."networkId"
  FROM "TelegramAdSale" s
  JOIN "TelegramAdSalePlacement" p ON p."telegramAdSaleId" = s."id"
  JOIN "TelegramChannelNetworkMember" member
    ON member."telegramChannelId" = p."telegramChannelId"
   AND member."workspaceId" = s."workspaceId"
  WHERE s."advertiserId" IS NOT NULL
    AND p."telegramChannelNetworkId" IS NULL
    AND s."status"::text IN ('RESERVED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
    AND p."status"::text NOT IN ('CANCELLED', 'MISSED')
) source
JOIN "TelegramAdvertiserTag" tag
  ON tag."workspaceId" = source."workspaceId"
 AND tag."systemKey" = 'NETWORK:' || source."networkId"
ON CONFLICT ("advertiserId", "tagId") DO NOTHING;
