ALTER TABLE "TelegramAdvertiser" ADD COLUMN "avatarIconId" TEXT;

ALTER TABLE "TelegramAdvertiser"
  ADD CONSTRAINT "TelegramAdvertiser_avatarIconId_fkey"
  FOREIGN KEY ("avatarIconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TelegramAdvertiser_avatarIconId_idx" ON "TelegramAdvertiser"("avatarIconId");
