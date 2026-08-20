ALTER TABLE "GreeterBroadcastRecipient"
ADD COLUMN "nextQueueAttemptAt" TIMESTAMP(3);

CREATE INDEX "GreeterBroadcastRecipient_status_nextQueueAttemptAt_idx"
ON "GreeterBroadcastRecipient"("status", "nextQueueAttemptAt");
