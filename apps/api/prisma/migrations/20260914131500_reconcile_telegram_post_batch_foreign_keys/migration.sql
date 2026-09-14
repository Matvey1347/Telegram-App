-- Keep the deployed constraint names aligned with the names Prisma derives
-- from the relation fields in schema.prisma.
ALTER TABLE "TelegramPostBatch"
  RENAME CONSTRAINT "TelegramPostBatch_createdByMember_fkey"
  TO "TelegramPostBatch_createdByMemberId_workspaceId_fkey";

ALTER TABLE "TelegramPostBatchMutualPromotionLink"
  RENAME CONSTRAINT "TelegramPostBatchMutualPromotionLink_folderId_fkey"
  TO "TelegramPostBatchMutualPromotionLink_mutualPromotionFolder_fkey";
