CREATE TYPE "TelegramMessageTemplateScopeMode" AS ENUM ('CHANNELS', 'NETWORK');

ALTER TABLE "TelegramChannel"
ADD COLUMN "tgStatUrl" TEXT,
ADD COLUMN "presentationIconId" TEXT,
ADD COLUMN "defaultInviteLinkId" TEXT;

CREATE INDEX "TelegramChannel_presentationIconId_idx"
ON "TelegramChannel"("presentationIconId");
CREATE INDEX "TelegramChannel_defaultInviteLinkId_idx"
ON "TelegramChannel"("defaultInviteLinkId");

ALTER TABLE "TelegramChannel"
ADD CONSTRAINT "TelegramChannel_presentationIconId_fkey"
FOREIGN KEY ("presentationIconId") REFERENCES "Icon"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramChannel"
ADD CONSTRAINT "TelegramChannel_defaultInviteLinkId_fkey"
FOREIGN KEY ("defaultInviteLinkId") REFERENCES "TelegramInviteLink"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TelegramChannelMessageTemplate" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT,
  "iconId" TEXT,
  "scopeMode" "TelegramMessageTemplateScopeMode" NOT NULL DEFAULT 'CHANNELS',
  "networkId" TEXT,
  "channelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "bodyTemplate" TEXT NOT NULL,
  "overrideInviteLinks" BOOLEAN NOT NULL DEFAULT false,
  "inviteLinkOverrides" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TelegramChannelMessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramChannelMessageTemplate_workspaceId_updatedAt_idx"
ON "TelegramChannelMessageTemplate"("workspaceId", "updatedAt");
CREATE INDEX "TelegramChannelMessageTemplate_iconId_idx"
ON "TelegramChannelMessageTemplate"("iconId");
CREATE INDEX "TelegramChannelMessageTemplate_networkId_idx"
ON "TelegramChannelMessageTemplate"("networkId");

ALTER TABLE "TelegramChannelMessageTemplate"
ADD CONSTRAINT "TelegramChannelMessageTemplate_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelMessageTemplate"
ADD CONSTRAINT "TelegramChannelMessageTemplate_iconId_fkey"
FOREIGN KEY ("iconId") REFERENCES "Icon"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelMessageTemplate"
ADD CONSTRAINT "TelegramChannelMessageTemplate_networkId_fkey"
FOREIGN KEY ("networkId") REFERENCES "TelegramChannelNetwork"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
