ALTER TABLE "TelegramManagedPostSendOperation"
  ADD COLUMN "relayStartedAt" TIMESTAMP(3),
  ADD COLUMN "relayPostRevision" TIMESTAMP(3);
