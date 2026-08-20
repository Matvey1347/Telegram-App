CREATE INDEX "TelegramAdSalePlacement_due_deletion_idx"
ON "TelegramAdSalePlacement"("status", "plannedDeleteAt", "lastDeletionAttemptAt");

CREATE INDEX "GreeterBroadcast_status_scheduledAt_idx"
ON "GreeterBroadcast"("status", "scheduledAt");

CREATE INDEX "TelegramManagedPost_due_identity_idx"
ON "TelegramManagedPost"("telegramIdVerificationStatus", "status", "telegramIdLastCheckedAt");
