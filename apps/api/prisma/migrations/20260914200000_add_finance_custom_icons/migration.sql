CREATE TABLE IF NOT EXISTS "FinanceCustomIcon" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinanceCustomIcon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceCustomIcon_profileId_name_key"
ON "FinanceCustomIcon"("profileId", "name");

CREATE INDEX IF NOT EXISTS "FinanceCustomIcon_profileId_updatedAt_idx"
ON "FinanceCustomIcon"("profileId", "updatedAt");

ALTER TABLE "FinanceCustomIcon"
ADD CONSTRAINT "FinanceCustomIcon_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
