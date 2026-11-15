ALTER TABLE "TelegramAiPostingGeneration"
  ADD COLUMN "researchCost" DECIMAL(24,12);
ALTER TABLE "TelegramAiPostingChatMessage"
  ADD COLUMN "replyToMessageId" TEXT;

CREATE TABLE "TelegramAiPostingIdea" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "audience" TEXT NOT NULL DEFAULT '',
  "valueProposition" TEXT NOT NULL DEFAULT '',
  "language" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramAiPostingIdea_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramAiPostingIdea_telegramChannelId_key" ON "TelegramAiPostingIdea"("telegramChannelId");
CREATE INDEX "TelegramAiPostingIdea_workspaceId_telegramChannelId_idx" ON "TelegramAiPostingIdea"("workspaceId", "telegramChannelId");
ALTER TABLE "TelegramAiPostingIdea" ADD CONSTRAINT "TelegramAiPostingIdea_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAiPostingIdea" ADD CONSTRAINT "TelegramAiPostingIdea_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TelegramAiPostingSphere" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "parentId" TEXT,
  "name" VARCHAR(120) NOT NULL,
  "emoji" VARCHAR(32) NOT NULL DEFAULT '✨',
  "tier" VARCHAR(16) NOT NULL DEFAULT 'SECONDARY',
  "description" VARCHAR(2000) NOT NULL DEFAULT '',
  "sources" JSONB NOT NULL DEFAULT '[]',
  "mediaPreferenceId" VARCHAR(128),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramAiPostingSphere_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TelegramAiPostingSphere_workspaceId_telegramChannelId_tier_idx" ON "TelegramAiPostingSphere"("workspaceId", "telegramChannelId", "tier");
CREATE INDEX "TelegramAiPostingSphere_parentId_idx" ON "TelegramAiPostingSphere"("parentId");
ALTER TABLE "TelegramAiPostingSphere" ADD CONSTRAINT "TelegramAiPostingSphere_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAiPostingSphere" ADD CONSTRAINT "TelegramAiPostingSphere_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAiPostingSphere" ADD CONSTRAINT "TelegramAiPostingSphere_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TelegramAiPostingSphere"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TelegramAiPostingLength" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "emoji" VARCHAR(32) NOT NULL DEFAULT '✍️',
  "minCharacters" INTEGER NOT NULL,
  "maxCharacters" INTEGER,
  "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramAiPostingLength_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramAiPostingLength_telegramChannelId_name_key" ON "TelegramAiPostingLength"("telegramChannelId", "name");
CREATE INDEX "TelegramAiPostingLength_workspaceId_telegramChannelId_isActive_idx" ON "TelegramAiPostingLength"("workspaceId", "telegramChannelId", "isActive");
ALTER TABLE "TelegramAiPostingLength" ADD CONSTRAINT "TelegramAiPostingLength_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAiPostingLength" ADD CONSTRAINT "TelegramAiPostingLength_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TelegramAiPostingRubric" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "sphereId" TEXT,
  "name" VARCHAR(120) NOT NULL,
  "emoji" VARCHAR(32) NOT NULL DEFAULT '📝',
  "description" VARCHAR(2000) NOT NULL DEFAULT '',
  "goal" VARCHAR(1000) NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramAiPostingRubric_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TelegramAiPostingRubric_workspaceId_telegramChannelId_sphereId_idx" ON "TelegramAiPostingRubric"("workspaceId", "telegramChannelId", "sphereId");
ALTER TABLE "TelegramAiPostingRubric" ADD CONSTRAINT "TelegramAiPostingRubric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAiPostingRubric" ADD CONSTRAINT "TelegramAiPostingRubric_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAiPostingRubric" ADD CONSTRAINT "TelegramAiPostingRubric_sphereId_fkey" FOREIGN KEY ("sphereId") REFERENCES "TelegramAiPostingSphere"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TelegramAiPostingRubricLength" (
  "rubricId" TEXT NOT NULL,
  "lengthId" TEXT NOT NULL,
  CONSTRAINT "TelegramAiPostingRubricLength_pkey" PRIMARY KEY ("rubricId", "lengthId")
);
CREATE INDEX "TelegramAiPostingRubricLength_lengthId_idx" ON "TelegramAiPostingRubricLength"("lengthId");
ALTER TABLE "TelegramAiPostingRubricLength" ADD CONSTRAINT "TelegramAiPostingRubricLength_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "TelegramAiPostingRubric"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAiPostingRubricLength" ADD CONSTRAINT "TelegramAiPostingRubricLength_lengthId_fkey" FOREIGN KEY ("lengthId") REFERENCES "TelegramAiPostingLength"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TelegramAiPostingIdea" ("id", "workspaceId", "telegramChannelId", "audience", "valueProposition", "language", "updatedAt")
SELECT 'aip-idea-' || s."telegramChannelId", s."workspaceId", s."telegramChannelId",
  COALESCE(s."configuration"->>'audience', ''), COALESCE(s."configuration"->>'topic', ''), COALESCE(s."configuration"->>'language', ''), CURRENT_TIMESTAMP
FROM "TelegramAiPostingSettings" s
ON CONFLICT ("telegramChannelId") DO NOTHING;

INSERT INTO "TelegramAiPostingLength" ("id", "workspaceId", "telegramChannelId", "name", "emoji", "minCharacters", "maxCharacters", "isBuiltin", "updatedAt")
SELECT ids.id, s."workspaceId", s."telegramChannelId", defs.name, defs.emoji, defs.min_chars, defs.max_chars, true, CURRENT_TIMESTAMP
FROM "TelegramAiPostingSettings" s
CROSS JOIN (VALUES
  ('ultra-short', 'Ультракороткая', '⚡', 0, 99),
  ('short', 'Короткая', '📝', 100, 299),
  ('medium', 'Средняя', '📖', 300, 699),
  ('long', 'Длинная', '📚', 700, NULL)
) AS defs(id, name, emoji, min_chars, max_chars)
CROSS JOIN LATERAL (SELECT s."telegramChannelId" || '::' || defs.id AS id) ids
ON CONFLICT ("id") DO NOTHING;
