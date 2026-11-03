ALTER TABLE "TelegramChannelReminderAssignment" DROP CONSTRAINT "TelegramChannelReminderAssignment_channel_fkey";
ALTER TABLE "TelegramChannelReminderAssignment" DROP CONSTRAINT "TelegramChannelReminderAssignment_template_fkey";
ALTER TABLE "TelegramChannelReminderAssignment" DROP CONSTRAINT "TelegramChannelReminderAssignment_workspace_fkey";
ALTER TABLE "TelegramChannelReminderTemplate" DROP CONSTRAINT "TelegramChannelReminderTemplate_workspace_fkey";

ALTER TABLE "TelegramChannelReminderTemplate" ADD CONSTRAINT "TelegramChannelReminderTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelReminderAssignment" ADD CONSTRAINT "TelegramChannelReminderAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelReminderAssignment" ADD CONSTRAINT "TelegramChannelReminderAssignment_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelReminderAssignment" ADD CONSTRAINT "TelegramChannelReminderAssignment_templateId_workspaceId_fkey" FOREIGN KEY ("templateId", "workspaceId") REFERENCES "TelegramChannelReminderTemplate"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
