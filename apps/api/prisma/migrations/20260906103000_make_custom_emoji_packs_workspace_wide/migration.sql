-- Premium emoji packs are already owned by a workspace. Remove the legacy
-- per-channel attachment layer while preserving every imported pack and emoji.
ALTER TABLE "TelegramCustomEmojiPack"
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "TelegramCustomEmojiPack_workspaceId_archivedAt_updatedAt_idx"
ON "TelegramCustomEmojiPack"("workspaceId", "archivedAt", "updatedAt");

DROP TABLE "TelegramChannelCustomEmojiPack";
