ALTER TABLE "User"
  ADD COLUMN "profileAvatarIconId" TEXT,
  ADD COLUMN "telegramUsername" TEXT,
  ADD COLUMN "profileTelegramUserAccountId" TEXT;

CREATE UNIQUE INDEX "User_profileTelegramUserAccountId_key"
  ON "User"("profileTelegramUserAccountId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_profileAvatarIconId_fkey"
  FOREIGN KEY ("profileAvatarIconId") REFERENCES "Icon"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "User_profileTelegramUserAccountId_fkey"
  FOREIGN KEY ("profileTelegramUserAccountId")
  REFERENCES "TelegramUserAccountIntegration"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "User" AS user_row
SET
  "profileAvatarIconId" = (
    SELECT member."avatarIconId"
    FROM "WorkspaceMember" AS member
    WHERE member."userId" = user_row.id
      AND member."avatarIconId" IS NOT NULL
    ORDER BY member."updatedAt" DESC, member.id
    LIMIT 1
  ),
  "telegramUsername" = (
    SELECT member."telegramUsername"
    FROM "WorkspaceMember" AS member
    WHERE member."userId" = user_row.id
      AND member."telegramUsername" IS NOT NULL
    ORDER BY member."updatedAt" DESC, member.id
    LIMIT 1
  );

UPDATE "User" AS user_row
SET "profileTelegramUserAccountId" = (
  SELECT integration.id
  FROM "TelegramUserAccountIntegration" AS integration
  LEFT JOIN "WorkspaceMember" AS member
    ON member.id = integration."assignedMemberId"
  WHERE member."userId" = user_row.id
     OR (
       integration."assignedMemberId" IS NULL
       AND integration."createdByUserId" = user_row.id
     )
  ORDER BY
    (integration.status = 'connected') DESC,
    (member."userId" = user_row.id) DESC,
    integration."updatedAt" DESC,
    integration.id
  LIMIT 1
);

INSERT INTO "Icon" (
  id, "workspaceId", type, name, emoji, "createdAt", "updatedAt"
)
SELECT
  'sys-investment-' || md5(workspace.id),
  workspace.id,
  'emoji'::"IconType",
  'money bag',
  '💰',
  NOW(),
  NOW()
FROM "Workspace" AS workspace
ON CONFLICT ("workspaceId", type, name)
DO UPDATE SET emoji = EXCLUDED.emoji, "updatedAt" = NOW();

INSERT INTO "Icon" (
  id, "workspaceId", type, name, emoji, "createdAt", "updatedAt"
)
SELECT
  'sys-advertising-' || md5(workspace.id),
  workspace.id,
  'emoji'::"IconType",
  'card file box',
  '🗃️',
  NOW(),
  NOW()
FROM "Workspace" AS workspace
ON CONFLICT ("workspaceId", type, name)
DO UPDATE SET emoji = EXCLUDED.emoji, "updatedAt" = NOW();

INSERT INTO "Icon" (
  id, "workspaceId", type, name, "imageUrl", "createdAt", "updatedAt"
)
SELECT
  'sys-buy-channels-' || md5(workspace.id),
  workspace.id,
  'image'::"IconType",
  'buy-channels',
  'https://s3.eu-central-003.backblazeb2.com/telegram-system/icons/1780854323445-xbxyq1jk.png',
  NOW(),
  NOW()
FROM "Workspace" AS workspace
ON CONFLICT ("workspaceId", type, name)
DO UPDATE SET "imageUrl" = EXCLUDED."imageUrl", "updatedAt" = NOW();

UPDATE "TransactionCategory" AS category
SET "iconId" = icon.id, "updatedAt" = NOW()
FROM "Icon" AS icon
WHERE category."workspaceId" = icon."workspaceId"
  AND category.key = 'investment'
  AND icon.type = 'emoji'::"IconType"
  AND icon.name = 'money bag';

UPDATE "TransactionCategory" AS category
SET "iconId" = icon.id, "updatedAt" = NOW()
FROM "Icon" AS icon
WHERE category."workspaceId" = icon."workspaceId"
  AND category.key = 'advertising'
  AND icon.type = 'emoji'::"IconType"
  AND icon.name = 'card file box';

UPDATE "TransactionCategory" AS category
SET "iconId" = icon.id, "updatedAt" = NOW()
FROM "Icon" AS icon
WHERE category."workspaceId" = icon."workspaceId"
  AND category.key = 'buy_channels'
  AND icon.type = 'image'::"IconType"
  AND icon.name = 'buy-channels';

UPDATE "TransactionCategory"
SET name = 'Ad Sales', "updatedAt" = NOW()
WHERE key = 'channel_advertising_revenue';

UPDATE "Transaction" AS transaction
SET category = 'Ad Sales', "updatedAt" = NOW()
FROM "TransactionCategory" AS category
WHERE transaction."categoryId" = category.id
  AND category.key = 'channel_advertising_revenue';

-- Repair the reported workspace after the stale deleted link is removed.
UPDATE "TelegramChannel"
SET "purchaseTransactionId" = NULL
WHERE "purchaseTransactionId" IN (
  SELECT id FROM "Transaction" WHERE "deletedAt" IS NOT NULL
);

UPDATE "TelegramChannel"
SET "purchaseTransactionId" = 'cmtysvigx0my10kl9pd0i4rxq',
    "acquisitionType" = 'PURCHASED'
WHERE id = 'cmtwwtdl40ah10kl9smkogmrz'
  AND "workspaceId" = '7b196253-497a-4d9b-9d4b-65224e1d338f'
  AND EXISTS (
    SELECT 1
    FROM "Transaction"
    WHERE id = 'cmtysvigx0my10kl9pd0i4rxq'
      AND "workspaceId" = '7b196253-497a-4d9b-9d4b-65224e1d338f'
      AND "deletedAt" IS NULL
  );
