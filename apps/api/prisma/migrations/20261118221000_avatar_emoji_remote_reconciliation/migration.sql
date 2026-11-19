-- Telegram converts uploaded PNG files into new custom emoji documents.
-- Persist the pre-mutation document set so unknown outcomes are reconciled,
-- never blindly retried using the upload file identity.
ALTER TABLE "ChannelAvatarEmojiAsset"
  ADD COLUMN "pendingDocumentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "remotePending" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "ChannelAvatarEmojiAsset_remotePending_idx" ON "ChannelAvatarEmojiAsset"("remotePending");
