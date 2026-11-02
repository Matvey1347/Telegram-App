ALTER TABLE "TelegramLeadSource" ADD COLUMN "bindingRevision" INTEGER NOT NULL DEFAULT 0;

-- A database trigger covers Prisma, raw SQL and foreign-key cascades alike.
-- Operational checkpoints and timestamps do not change a source's eligibility.
CREATE FUNCTION "lead_source_binding_revision"() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW."workspaceId", NEW."type", NEW."normalizedKey", NEW."channelId",
         NEW."username", NEW."accountId", NEW."accessType", NEW."processingReference",
         NEW."allowOwnChannel", NEW."monitoringState", NEW."monitoringActorUserId")
     IS DISTINCT FROM
     ROW(OLD."workspaceId", OLD."type", OLD."normalizedKey", OLD."channelId",
         OLD."username", OLD."accountId", OLD."accessType", OLD."processingReference",
         OLD."allowOwnChannel", OLD."monitoringState", OLD."monitoringActorUserId") THEN
    NEW."bindingRevision" := OLD."bindingRevision" + 1;
  ELSE
    NEW."bindingRevision" := OLD."bindingRevision";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "lead_source_binding_revision_trigger"
BEFORE UPDATE ON "TelegramLeadSource"
FOR EACH ROW EXECUTE FUNCTION "lead_source_binding_revision"();
