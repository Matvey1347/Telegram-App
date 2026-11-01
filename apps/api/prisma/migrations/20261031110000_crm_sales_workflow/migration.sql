CREATE TYPE "TelegramCrmManualSalesStatus" AS ENUM ('INTERESTED', 'CLOSED', 'DO_NOT_CONTACT', 'HUMAN_REVIEW');
ALTER TABLE "TelegramAdvertiser" ADD COLUMN "manualSalesStatus" "TelegramCrmManualSalesStatus";
-- Match the bounded linked-sale history keyset, including equal timestamps.
CREATE INDEX "TelegramAdSale_workspace_advertiser_created_id_idx"
  ON "TelegramAdSale" ("workspaceId", "advertiserId", "createdAt", "id");
DROP INDEX "TelegramAdSale_workspaceId_advertiserId_createdAt_idx";
-- Current reminder reads must not sort a client's entire completed task history.
CREATE INDEX "TelegramAdvertiserTask_open_effective_reminder_idx"
  ON "TelegramAdvertiserTask" ("workspaceId", "advertiserId", (COALESCE("snoozedUntil", "remindAt", "dueAt")), "id")
  WHERE "status" IN ('OPEN'::"TelegramAdvertiserTaskStatus", 'IN_PROGRESS'::"TelegramAdvertiserTaskStatus");
