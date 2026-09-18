ALTER TABLE "CrossPromotionPlan"
ADD COLUMN "nextDueAt" TIMESTAMP(3);

UPDATE "CrossPromotionPlan"
SET "nextDueAt" = "trackingEndsAt"
WHERE "status" IN ('SCHEDULED', 'ACTIVE')
  AND "trackingEndsAt" IS NOT NULL;

CREATE INDEX "CrossPromotionPlan_due_idx"
ON "CrossPromotionPlan"("status", "nextDueAt", "id");
