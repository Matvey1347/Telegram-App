ALTER TABLE "TelegramBotRuntimeInstance"
ADD COLUMN "financeLogoImage" BYTEA,
ADD COLUMN "financeLogoMimeType" TEXT,
ADD COLUMN "financeFaviconImage" BYTEA,
ADD COLUMN "financeFaviconMimeType" TEXT,
ADD COLUMN "financeBrandingUpdatedAt" TIMESTAMP(3);

-- Existing branding was shared across environments, so seed each runtime with
-- that shared value. New updates are stored independently per runtime.
UPDATE "TelegramBotRuntimeInstance" AS runtime
SET
  "financeLogoImage" = integration."financeLogoImage",
  "financeLogoMimeType" = integration."financeLogoMimeType",
  "financeFaviconImage" = integration."financeFaviconImage",
  "financeFaviconMimeType" = integration."financeFaviconMimeType",
  "financeBrandingUpdatedAt" = integration."financeBrandingUpdatedAt"
FROM "TelegramBotIntegration" AS integration
WHERE runtime."botIntegrationId" = integration."id"
  AND runtime."workspaceId" = integration."workspaceId";

-- Do not discard an existing shared image if its integration has no runtime
-- row to receive it. Such data needs a separate recovery decision.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "TelegramBotIntegration" AS integration
    WHERE (integration."financeLogoImage" IS NOT NULL
      OR integration."financeFaviconImage" IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1
        FROM "TelegramBotRuntimeInstance" AS runtime
        WHERE runtime."botIntegrationId" = integration."id"
          AND runtime."workspaceId" = integration."workspaceId"
      )
  ) THEN
    RAISE EXCEPTION 'Finance branding migration found an image without a bot runtime';
  END IF;
END $$;

ALTER TABLE "TelegramBotIntegration"
DROP COLUMN "financeLogoImage",
DROP COLUMN "financeLogoMimeType",
DROP COLUMN "financeFaviconImage",
DROP COLUMN "financeFaviconMimeType",
DROP COLUMN "financeBrandingUpdatedAt";
