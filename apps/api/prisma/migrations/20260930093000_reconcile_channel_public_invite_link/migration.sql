-- `publicUrl` was a free-text legacy field. Channel presentation now uses the
-- selected workspace invite link, so retain only the relational contract.
ALTER TABLE "TelegramChannel" DROP COLUMN IF EXISTS "publicUrl";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'TelegramChannel_publicInviteLinkId_fkey'
  ) THEN
    ALTER TABLE "TelegramChannel"
      ADD CONSTRAINT "TelegramChannel_publicInviteLinkId_fkey"
      FOREIGN KEY ("publicInviteLinkId")
      REFERENCES "TelegramInviteLink"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
