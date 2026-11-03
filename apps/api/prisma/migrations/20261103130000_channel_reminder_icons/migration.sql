ALTER TABLE "TelegramChannelReminderTemplate" ADD COLUMN "iconId" TEXT;
ALTER TABLE "TelegramChannelReminderTemplate" ADD CONSTRAINT "TelegramChannelReminderTemplate_iconId_fkey" FOREIGN KEY ("iconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
