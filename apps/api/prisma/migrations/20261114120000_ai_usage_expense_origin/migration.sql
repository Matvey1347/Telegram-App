ALTER TABLE "AiOperation"
  ADD COLUMN "source" VARCHAR(20) NOT NULL DEFAULT 'PRODUCTION';

ALTER TABLE "AiUsageDaily"
  ADD COLUMN "source" VARCHAR(20) NOT NULL DEFAULT 'PRODUCTION';

DROP INDEX "AiUsageDaily_dimensions_key";
CREATE UNIQUE INDEX "AiUsageDaily_dimensions_key"
  ON "AiUsageDaily"(
    "workspaceId",
    "source",
    "day",
    "category",
    "provider",
    "model",
    "status",
    "aiPostingChannelId",
    "aiPostingPublicationKey",
    "aiPostingMode"
  );

ALTER TABLE "AiUsageDaily"
  ADD CONSTRAINT "AiUsageDaily_source_check"
  CHECK ("source" IN ('PRODUCTION', 'LOCAL_UNSYNCED', 'LOCAL_SYNCED'));

ALTER TABLE "AiOperation"
  ADD CONSTRAINT "AiOperation_source_check"
  CHECK ("source" IN ('PRODUCTION', 'LOCAL_UNSYNCED', 'LOCAL_SYNCED'));
