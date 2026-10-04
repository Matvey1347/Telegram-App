-- Consolidate legacy CRM cards that share a case-insensitive display name or
-- Telegram username. The recursive component also catches a name-only card
-- connected to a username card, so all of one customer's data has one owner.
CREATE TEMP TABLE "CrmDuplicateContactMerge" AS
WITH RECURSIVE identityValues AS (
  SELECT
    advertiser."id",
    advertiser."workspaceId",
    'name:' || lower(btrim(advertiser."displayName")) AS "identity"
  FROM "TelegramAdvertiser" advertiser
  WHERE btrim(advertiser."displayName") <> ''

  UNION

  SELECT
    advertiser."id",
    advertiser."workspaceId",
    'username:' || lower(btrim(advertiser."telegramUsername")) AS "identity"
  FROM "TelegramAdvertiser" advertiser
  WHERE btrim(coalesce(advertiser."telegramUsername", '')) <> ''

  UNION

  SELECT
    contact."advertiserId" AS "id",
    contact."workspaceId",
    'username:' || lower(btrim(contact."normalizedValue")) AS "identity"
  FROM "TelegramAdvertiserContact" contact
  WHERE contact."type" = 'TELEGRAM_USERNAME'
    AND btrim(contact."normalizedValue") <> ''
), edges AS (
  SELECT leftIdentity."id" AS "leftId", rightIdentity."id" AS "rightId"
  FROM identityValues leftIdentity
  JOIN identityValues rightIdentity
    ON rightIdentity."workspaceId" = leftIdentity."workspaceId"
   AND rightIdentity."identity" = leftIdentity."identity"
   AND rightIdentity."id" > leftIdentity."id"
), reachable ("rootId", "id") AS (
  SELECT "id", "id"
  FROM "TelegramAdvertiser"

  UNION

  SELECT
    reachable."rootId",
    CASE
      WHEN edges."leftId" = reachable."id" THEN edges."rightId"
      ELSE edges."leftId"
    END
  FROM reachable
  JOIN edges
    ON edges."leftId" = reachable."id"
    OR edges."rightId" = reachable."id"
), components AS (
  SELECT "id", min("rootId") AS "componentId"
  FROM reachable
  GROUP BY "id"
), ranked AS (
  SELECT
    advertiser."id",
    components."componentId",
    row_number() OVER (
      PARTITION BY components."componentId"
      ORDER BY advertiser."totalSalesCount" DESC, advertiser."createdAt" ASC, advertiser."id" ASC
    ) AS position
  FROM "TelegramAdvertiser" advertiser
  JOIN components ON components."id" = advertiser."id"
), winners AS (
  SELECT "componentId", "id" AS "targetId"
  FROM ranked
  WHERE position = 1
)
SELECT source."id" AS "sourceId", winner."targetId"
FROM ranked source
JOIN winners winner
  ON winner."componentId" = source."componentId"
WHERE source.position > 1;

-- Contacts are unique per workspace/type/normalized value. Keep the most
-- useful copy before reparenting source contacts, otherwise two cards that
-- already share a Telegram handle would make the merge fail mid-migration.
CREATE TEMP TABLE "CrmDuplicateContactRemoval" AS
WITH candidates AS (
  SELECT
    contact."id",
    target."targetId",
    true AS "alreadyOnTarget",
    contact."isVerified",
    contact."isPrimary",
    contact."createdAt",
    contact."type",
    contact."normalizedValue"
  FROM "TelegramAdvertiserContact" contact
  JOIN (SELECT DISTINCT "targetId" FROM "CrmDuplicateContactMerge") target
    ON contact."advertiserId" = target."targetId"

  UNION ALL

  SELECT
    contact."id",
    merge."targetId",
    false AS "alreadyOnTarget",
    contact."isVerified",
    contact."isPrimary",
    contact."createdAt",
    contact."type",
    contact."normalizedValue"
  FROM "TelegramAdvertiserContact" contact
  JOIN "CrmDuplicateContactMerge" merge
    ON contact."advertiserId" = merge."sourceId"
), rankedContacts AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "targetId", "type", "normalizedValue"
      ORDER BY
        "alreadyOnTarget" DESC,
        "isVerified" DESC,
        "isPrimary" DESC,
        "createdAt" ASC,
        "id" ASC
    ) AS position
  FROM candidates
)
SELECT "id"
FROM rankedContacts
WHERE position > 1;

DELETE FROM "TelegramAdvertiserContact" contact
USING "CrmDuplicateContactRemoval" duplicate
WHERE contact."id" = duplicate."id";

-- Preserve tag uniqueness before moving tag assignments to the target.
DELETE FROM "TelegramAdvertiserTagAssignment" sourceTag
USING "TelegramAdvertiserTagAssignment" targetTag,
      "CrmDuplicateContactMerge" merge
WHERE sourceTag."advertiserId" = merge."sourceId"
  AND targetTag."advertiserId" = merge."targetId"
  AND targetTag."tagId" = sourceTag."tagId";

UPDATE "TelegramAdvertiserContact" item
SET "advertiserId" = merge."targetId"
FROM "CrmDuplicateContactMerge" merge
WHERE item."advertiserId" = merge."sourceId";

UPDATE "TelegramAdvertiserTagAssignment" item
SET "advertiserId" = merge."targetId"
FROM "CrmDuplicateContactMerge" merge
WHERE item."advertiserId" = merge."sourceId";

UPDATE "TelegramCrmPeer" item
SET "contactId" = merge."targetId"
FROM "CrmDuplicateContactMerge" merge
WHERE item."contactId" = merge."sourceId";

UPDATE "TelegramCrmConversation" item
SET "contactId" = merge."targetId"
FROM "CrmDuplicateContactMerge" merge
WHERE item."contactId" = merge."sourceId";

UPDATE "TelegramAdSale" item
SET "advertiserId" = merge."targetId"
FROM "CrmDuplicateContactMerge" merge
WHERE item."advertiserId" = merge."sourceId";

UPDATE "TelegramAdvertiserTask" item
SET "advertiserId" = merge."targetId"
FROM "CrmDuplicateContactMerge" merge
WHERE item."advertiserId" = merge."sourceId";

UPDATE "TelegramAdvertiserActivity" item
SET "advertiserId" = merge."targetId"
FROM "CrmDuplicateContactMerge" merge
WHERE item."advertiserId" = merge."sourceId";

UPDATE "TelegramAdvertiserAutomationExecution" item
SET "advertiserId" = merge."targetId"
FROM "CrmDuplicateContactMerge" merge
WHERE item."advertiserId" = merge."sourceId";

UPDATE "CrossPromotionPlan" item
SET "advertiserId" = merge."targetId"
FROM "CrmDuplicateContactMerge" merge
WHERE item."advertiserId" = merge."sourceId";

-- Keep legacy counters coherent for consumers that still use the stored CRM
-- totals; list cards derive their visible deal values from the linked deals.
UPDATE "TelegramAdvertiser" target
SET
  "totalSalesCount" = target."totalSalesCount" + sourceTotals."totalSalesCount",
  "completedSalesCount" = target."completedSalesCount" + sourceTotals."completedSalesCount",
  "totalPlacementsCount" = target."totalPlacementsCount" + sourceTotals."totalPlacementsCount",
  "totalRevenueInPrimaryCurrency" = target."totalRevenueInPrimaryCurrency" + sourceTotals."totalRevenueInPrimaryCurrency",
  "averageOrderValueInPrimaryCurrency" = CASE
    WHEN target."totalSalesCount" + sourceTotals."totalSalesCount" > 0
      THEN (target."totalRevenueInPrimaryCurrency" + sourceTotals."totalRevenueInPrimaryCurrency") /
           (target."totalSalesCount" + sourceTotals."totalSalesCount")
    ELSE 0
  END,
  "updatedAt" = NOW()
FROM (
  SELECT
    merge."targetId",
    sum(source."totalSalesCount") AS "totalSalesCount",
    sum(source."completedSalesCount") AS "completedSalesCount",
    sum(source."totalPlacementsCount") AS "totalPlacementsCount",
    sum(source."totalRevenueInPrimaryCurrency") AS "totalRevenueInPrimaryCurrency"
  FROM "CrmDuplicateContactMerge" merge
  JOIN "TelegramAdvertiser" source ON source."id" = merge."sourceId"
  GROUP BY merge."targetId"
) sourceTotals
WHERE target."id" = sourceTotals."targetId";

DELETE FROM "TelegramAdvertiser" source
USING "CrmDuplicateContactMerge" merge
WHERE source."id" = merge."sourceId";
