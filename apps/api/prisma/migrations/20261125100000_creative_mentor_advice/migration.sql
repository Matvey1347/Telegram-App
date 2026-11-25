ALTER TYPE "CreativeSection" ADD VALUE IF NOT EXISTS 'mentor';
ALTER TABLE "WorkspaceCreative" ALTER COLUMN "target" DROP NOT NULL;
