ALTER TABLE "Workspace"
ADD COLUMN IF NOT EXISTS "systemNetworkExcludedChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
