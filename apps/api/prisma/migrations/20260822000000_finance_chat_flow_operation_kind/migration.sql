-- Each mutable finance chat flow declares its operation explicitly.  The
-- state-machine step remains intentionally flexible while this column makes
-- persisted flow ownership and diagnostics unambiguous.
ALTER TABLE "FinanceChatFlow"
  ADD COLUMN "operationKind" VARCHAR(40) NOT NULL DEFAULT 'ACCOUNT_CREATE';
