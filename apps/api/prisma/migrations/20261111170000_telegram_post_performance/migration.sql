ALTER TABLE "TelegramManagedPost"
  ADD COLUMN "telegramPostId" TEXT;

CREATE INDEX "TelegramManagedPost_telegramPostId_idx"
  ON "TelegramManagedPost"("telegramPostId");

ALTER TABLE "TelegramManagedPost"
  ADD CONSTRAINT "TelegramManagedPost_telegramPostId_fkey"
  FOREIGN KEY ("telegramPostId") REFERENCES "TelegramPost"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "TelegramManagedPost" managed
SET "telegramPostId" = post."id"
FROM "TelegramPost" post
WHERE managed."telegramPostId" IS NULL
  AND managed."telegramChannelId" = post."telegramChannelId"
  AND managed."telegramMessageIds"[1] = post."telegramMessageId";

CREATE TABLE "TelegramPostPerformance" (
  "id" TEXT NOT NULL,
  "telegramPostId" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "views24h" INTEGER,
  "views72h" INTEGER,
  "views168h" INTEGER,
  "viewsFinal" INTEGER,
  "reactions24h" INTEGER,
  "forwards24h" INTEGER,
  "comments24h" INTEGER,
  "engagementPer1k24h" DOUBLE PRECISION,
  "norm24h" DOUBLE PRECISION,
  "score24h" DOUBLE PRECISION,
  "normFinal" DOUBLE PRECISION,
  "scoreFinal" DOUBLE PRECISION,
  "normSampleSize" INTEGER NOT NULL DEFAULT 0,
  "lengthChars" INTEGER NOT NULL,
  "lengthBand" TEXT NOT NULL,
  "hasMedia" BOOLEAN NOT NULL,
  "mediaKind" TEXT,
  "hasLink" BOOLEAN NOT NULL,
  "endsWithQuestion" BOOLEAN NOT NULL,
  "publishHour" INTEGER NOT NULL,
  "publishWeekday" INTEGER NOT NULL,
  "excludedFromNorm" BOOLEAN NOT NULL DEFAULT false,
  "excludedReason" TEXT,
  "methodVersion" TEXT NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramPostPerformance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramPostPerformance_telegramPostId_key"
  ON "TelegramPostPerformance"("telegramPostId");
CREATE INDEX "TelegramPostPerformance_publishedAt_origin_idx"
  ON "TelegramPostPerformance"("publishedAt", "origin");
CREATE INDEX "TelegramPostPerformance_origin_scoreFinal_idx"
  ON "TelegramPostPerformance"("origin", "scoreFinal");
CREATE INDEX "TelegramPostPerformance_excludedFromNorm_publishedAt_idx"
  ON "TelegramPostPerformance"("excludedFromNorm", "publishedAt");

ALTER TABLE "TelegramPostPerformance"
  ADD CONSTRAINT "TelegramPostPerformance_telegramPostId_fkey"
  FOREIGN KEY ("telegramPostId") REFERENCES "TelegramPost"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
