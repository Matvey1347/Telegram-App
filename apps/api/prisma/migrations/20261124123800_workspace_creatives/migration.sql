CREATE TYPE "CreativeSection" AS ENUM ('good', 'bad', 'attempt');
CREATE TYPE "CreativeTarget" AS ENUM ('externalProduct', 'channel');

CREATE TABLE "WorkspaceCreative" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "section" "CreativeSection" NOT NULL,
    "target" "CreativeTarget" NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceUrl" TEXT,
    CONSTRAINT "WorkspaceCreative_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceCreativeAttachment" (
    "creativeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    CONSTRAINT "WorkspaceCreativeAttachment_pkey" PRIMARY KEY ("creativeId")
);

CREATE TABLE "WorkspaceCreativeComment" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceCreativeComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceCreative_workspaceId_section_id_idx" ON "WorkspaceCreative"("workspaceId", "section", "id");
CREATE INDEX "WorkspaceCreativeComment_creativeId_createdAt_id_idx" ON "WorkspaceCreativeComment"("creativeId", "createdAt", "id");

ALTER TABLE "WorkspaceCreative" ADD CONSTRAINT "WorkspaceCreative_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceCreativeAttachment" ADD CONSTRAINT "WorkspaceCreativeAttachment_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "WorkspaceCreative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceCreativeComment" ADD CONSTRAINT "WorkspaceCreativeComment_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "WorkspaceCreative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
