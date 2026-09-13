CREATE TYPE "CrossPromotionPlanKind" AS ENUM ('DIRECT_MUTUAL', 'OWN_CHANNELS');
CREATE TYPE "CrossPromotionPlanStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE TABLE "CrossPromotionPlan" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "kind" "CrossPromotionPlanKind" NOT NULL,
  "status" "CrossPromotionPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "publisherChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "partnerChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "targets" JSONB NOT NULL,
  "publicationPost" JSONB NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "trackingEndsAt" TIMESTAMP(3),
  "baselineTargetCounters" JSONB NOT NULL DEFAULT '[]'::JSONB,
  "baselinePublisherSubscribers" JSONB NOT NULL DEFAULT '[]'::JSONB,
  "placementPostIds" JSONB NOT NULL DEFAULT '[]'::JSONB,
  "lastError" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CrossPromotionPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrossPromotionPlan_workspace_kind_date_idx"
ON "CrossPromotionPlan"("workspaceId", "kind", "scheduledAt");
CREATE INDEX "CrossPromotionPlan_workspace_status_date_idx"
ON "CrossPromotionPlan"("workspaceId", "status", "scheduledAt");

ALTER TABLE "CrossPromotionPlan"
ADD CONSTRAINT "CrossPromotionPlan_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
