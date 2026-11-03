ALTER TABLE "TelegramLeadAutoConfig"
  ADD COLUMN "reconcileNeeded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reconcileGeneration" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reconcileRunningGeneration" INTEGER,
  ADD COLUMN "reconcileCursorObservedAt" TIMESTAMP(3),
  ADD COLUMN "reconcileCursorId" TEXT,
  ADD COLUMN "reconcileSnapshotObservedAt" TIMESTAMP(3),
  ADD COLUMN "reconcileSnapshotId" TEXT;

-- Lock order: workspace advisory lock where used, source, queue, config.
CREATE FUNCTION lead_reconcile_source_binding_changed() RETURNS trigger AS $$
BEGIN
  DELETE FROM "TelegramLeadAnalysisQueue"
  WHERE "workspaceId" = NEW."workspaceId" AND "sourceId" = NEW.id
    AND status = 'WAIT_AUTH_RECHECK' AND "bindingRevision" <> NEW."bindingRevision";
  UPDATE "TelegramLeadAutoConfig"
  SET "reconcileNeeded" = true, "reconcileGeneration" = "reconcileGeneration" + 1
  WHERE "workspaceId" = NEW."workspaceId" AND "sourceId" = NEW.id AND enabled = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lead_reconcile_source_binding_changed
AFTER UPDATE ON "TelegramLeadSource"
FOR EACH ROW WHEN (OLD."bindingRevision" IS DISTINCT FROM NEW."bindingRevision")
EXECUTE FUNCTION lead_reconcile_source_binding_changed();
