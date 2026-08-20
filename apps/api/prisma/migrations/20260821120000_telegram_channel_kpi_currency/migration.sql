ALTER TABLE "TelegramChannel"
ADD COLUMN "kpiCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD';

-- Existing thresholds were expressed in the workspace primary currency.
-- Preserve their numeric values and make that implicit currency explicit.
UPDATE "TelegramChannel" AS channel
SET "kpiCurrency" = workspace."primaryCurrency"
FROM "Workspace" AS workspace
WHERE workspace.id = channel."workspaceId";

ALTER TABLE "TelegramChannel"
ALTER COLUMN "kpiCurrency" DROP DEFAULT;
