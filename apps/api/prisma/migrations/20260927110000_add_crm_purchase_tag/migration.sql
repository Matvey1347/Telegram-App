ALTER TABLE "TelegramAdCrmWorkspaceSettings"
  ADD COLUMN "purchaseTagId" TEXT;

ALTER TABLE "TelegramAdCrmWorkspaceSettings"
  ADD CONSTRAINT "TelegramAdCrmWorkspaceSettings_purchaseTag_fkey"
  FOREIGN KEY ("purchaseTagId") REFERENCES "TelegramAdvertiserTag"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TelegramAdCrmWorkspaceSettings_purchaseTagId_idx"
  ON "TelegramAdCrmWorkspaceSettings"("purchaseTagId");
