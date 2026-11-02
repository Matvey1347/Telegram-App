-- Run only against an isolated test database: psql -v ON_ERROR_STOP=1 -f test.sql
BEGIN;
CREATE SCHEMA lead_binding_test;
SET LOCAL search_path TO lead_binding_test;
CREATE TABLE "TelegramLeadSource" (
  id text PRIMARY KEY, "workspaceId" text NOT NULL, type text NOT NULL,
  "normalizedKey" text NOT NULL, "channelId" text, username text, "accountId" text,
  "accessType" text NOT NULL, "processingReference" text NOT NULL,
  "allowOwnChannel" boolean NOT NULL, "monitoringState" text NOT NULL,
  "monitoringActorUserId" text NOT NULL, "lastObservedAt" timestamptz
);
\ir migration.sql
INSERT INTO "TelegramLeadSource" VALUES ('one','ws','channel','key','channel','name','account','subscribed','policy:a',false,'ACTIVE','actor',NULL,DEFAULT);
UPDATE "TelegramLeadSource" SET "lastObservedAt"=now() WHERE id='one';
DO $$ BEGIN
  IF (SELECT "bindingRevision" FROM "TelegramLeadSource" WHERE id='one') <> 0 THEN RAISE EXCEPTION 'checkpoint changed revision'; END IF;
END $$;
UPDATE "TelegramLeadSource" SET "processingReference"='policy:b' WHERE id='one';
UPDATE "TelegramLeadSource" SET "processingReference"='policy:a' WHERE id='one';
DO $$ BEGIN
  IF (SELECT "bindingRevision" FROM "TelegramLeadSource" WHERE id='one') <> 2 THEN RAISE EXCEPTION 'A-B-A not detected'; END IF;
  UPDATE "TelegramLeadSource" SET "lastObservedAt"=now() WHERE id='one' AND "bindingRevision"=0;
  IF FOUND THEN RAISE EXCEPTION 'stale snapshot accepted'; END IF;
END $$;
UPDATE "TelegramLeadSource" SET "monitoringState"='PAUSED', "bindingRevision"=0 WHERE id='one';
UPDATE "TelegramLeadSource" SET "bindingRevision"=0 WHERE id='one';
DO $$ BEGIN
  IF (SELECT "bindingRevision" FROM "TelegramLeadSource" WHERE id='one') <> 3 THEN RAISE EXCEPTION 'revision tampered'; END IF;
END $$;
ROLLBACK;
