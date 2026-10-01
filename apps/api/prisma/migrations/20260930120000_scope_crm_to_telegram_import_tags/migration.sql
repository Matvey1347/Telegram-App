ALTER TABLE "TelegramAdCrmWorkspaceSettings"
  ADD COLUMN IF NOT EXISTS "importTagIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- The former workflow/manual tags are not Telegram folders. They must not
-- participate in CRM filters, purchases, or analytics any longer.
DELETE FROM "TelegramAdvertiserTagAssignment" AS assignment
USING "TelegramAdvertiserTag" AS tag
WHERE assignment."tagId" = tag."id"
  AND (tag."systemKey" IS NULL OR tag."systemKey" NOT LIKE 'TELEGRAM_FOLDER:%');

DELETE FROM "TelegramAdvertiserTag"
WHERE "systemKey" IS NULL OR "systemKey" NOT LIKE 'TELEGRAM_FOLDER:%';

-- Repair the duplicate shape created by early CRM imports: keep the Contact
-- already linked to the immutable Telegram peer and move the legacy Contact's
-- CRM graph (including VP plans) onto it. Only exact normalized usernames are
-- eligible, so contacts without a reliable Telegram identity are untouched.
DROP TABLE IF EXISTS "TelegramCrmDuplicateRepair";
CREATE TABLE "TelegramCrmDuplicateRepair" AS
SELECT DISTINCT ON (legacy."id")
  legacy."id" AS "legacyId",
  canonical."id" AS "canonicalId",
  legacy."workspaceId" AS "workspaceId"
FROM "TelegramAdvertiser" AS legacy
JOIN "TelegramAdvertiser" AS canonical
  ON canonical."workspaceId" = legacy."workspaceId"
 AND canonical."id" <> legacy."id"
 AND canonical."source" = 'TELEGRAM_MTPROTO_IMPORT'
 AND lower(trim(both '@' FROM canonical."telegramUsername")) = lower(trim(both '@' FROM legacy."telegramUsername"))
JOIN "TelegramCrmPeer" AS peer
  ON peer."workspaceId" = canonical."workspaceId"
 AND peer."contactId" = canonical."id"
WHERE legacy."telegramUsername" IS NOT NULL
  AND trim(legacy."telegramUsername") <> ''
  AND legacy."source" IS DISTINCT FROM 'TELEGRAM_MTPROTO_IMPORT'
ORDER BY legacy."id", canonical."updatedAt" DESC, canonical."id";

DELETE FROM "TelegramAdvertiserTagAssignment" AS legacyAssignment
USING "TelegramCrmDuplicateRepair" AS repair,
  "TelegramAdvertiserTagAssignment" AS canonicalAssignment
WHERE legacyAssignment."advertiserId" = repair."legacyId"
  AND canonicalAssignment."advertiserId" = repair."canonicalId"
  AND canonicalAssignment."tagId" = legacyAssignment."tagId";

UPDATE "TelegramCrmPeer" AS row SET "contactId" = repair."canonicalId"
FROM "TelegramCrmDuplicateRepair" AS repair
WHERE row."workspaceId" = repair."workspaceId" AND row."contactId" = repair."legacyId";
UPDATE "TelegramCrmConversation" AS row SET "contactId" = repair."canonicalId"
FROM "TelegramCrmDuplicateRepair" AS repair
WHERE row."workspaceId" = repair."workspaceId" AND row."contactId" = repair."legacyId";
UPDATE "TelegramAdSale" AS row SET "advertiserId" = repair."canonicalId"
FROM "TelegramCrmDuplicateRepair" AS repair
WHERE row."workspaceId" = repair."workspaceId" AND row."advertiserId" = repair."legacyId";
UPDATE "TelegramAdvertiserTask" AS row SET "advertiserId" = repair."canonicalId"
FROM "TelegramCrmDuplicateRepair" AS repair
WHERE row."workspaceId" = repair."workspaceId" AND row."advertiserId" = repair."legacyId";
UPDATE "TelegramAdvertiserActivity" AS row SET "advertiserId" = repair."canonicalId"
FROM "TelegramCrmDuplicateRepair" AS repair
WHERE row."workspaceId" = repair."workspaceId" AND row."advertiserId" = repair."legacyId";
UPDATE "TelegramAdvertiserContact" AS row SET "advertiserId" = repair."canonicalId"
FROM "TelegramCrmDuplicateRepair" AS repair
WHERE row."workspaceId" = repair."workspaceId" AND row."advertiserId" = repair."legacyId";
UPDATE "TelegramAdvertiserTagAssignment" AS row SET "advertiserId" = repair."canonicalId"
FROM "TelegramCrmDuplicateRepair" AS repair
WHERE row."workspaceId" = repair."workspaceId" AND row."advertiserId" = repair."legacyId";
UPDATE "TelegramAdvertiserAutomationExecution" AS row SET "advertiserId" = repair."canonicalId"
FROM "TelegramCrmDuplicateRepair" AS repair
WHERE row."workspaceId" = repair."workspaceId" AND row."advertiserId" = repair."legacyId";
UPDATE "CrossPromotionPlan" AS row SET "advertiserId" = repair."canonicalId"
FROM "TelegramCrmDuplicateRepair" AS repair
WHERE row."workspaceId" = repair."workspaceId" AND row."advertiserId" = repair."legacyId";

DELETE FROM "TelegramAdvertiser" AS legacy
USING "TelegramCrmDuplicateRepair" AS repair
WHERE legacy."id" = repair."legacyId";

DROP TABLE "TelegramCrmDuplicateRepair";
