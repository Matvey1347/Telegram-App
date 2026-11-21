ALTER TABLE "TelegramInviteLink"
  ADD COLUMN "joinedObservedAt" TIMESTAMP(3),
  ADD COLUMN "requestedObservedAt" TIMESTAMP(3),
  ADD COLUMN "joinedObserved" BOOLEAN,
  ADD COLUMN "requestedObserved" BOOLEAN;

ALTER TABLE "TelegramInviteLinkSnapshot"
  ALTER COLUMN "joinedCount" DROP NOT NULL,
  ALTER COLUMN "joinedCount" DROP DEFAULT,
  ALTER COLUMN "requestedCount" DROP NOT NULL,
  ALTER COLUMN "requestedCount" DROP DEFAULT;
