ALTER TABLE "TelegramUserAccountIntegration"
ADD COLUMN "isPreferredInviteLinkAccount" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "TelegramUserAccountIntegration_preferred_invite_account_idx"
ON "TelegramUserAccountIntegration" ("workspaceId")
WHERE "isPreferredInviteLinkAccount" = true;
