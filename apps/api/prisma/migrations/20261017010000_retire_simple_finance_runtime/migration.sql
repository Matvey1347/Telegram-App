-- Legacy Simple Finance runtime retirement is intentionally non-destructive.
-- Its enum value, tables, and records remain until production data has been
-- assessed and a separately approved retention/drop plan exists.
--
-- Deploy only after old webhook/runtime workers are quiesced. This migration
-- prevents the current runtime from selecting the removed application; it
-- cannot retract a message already sent by an old worker.
UPDATE "TelegramBotIntegration"
SET
  "applicationType" = 'NONE'::"TelegramBotApplicationType",
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "applicationType" = 'SIMPLE_FINANCE'::"TelegramBotApplicationType";
