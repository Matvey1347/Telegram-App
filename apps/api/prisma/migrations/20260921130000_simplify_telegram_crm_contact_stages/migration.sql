-- Keep the five CRM outcomes meaningful: prospects, customers, losses and non-client relationships.
ALTER TYPE "TelegramCrmContactStage" RENAME TO "TelegramCrmContactStage_old";
CREATE TYPE "TelegramCrmContactStage" AS ENUM ('NEW', 'LEAD', 'CUSTOMER', 'LOST', 'ANOTHER');

ALTER TABLE "TelegramAdvertiser"
  ALTER COLUMN "stage" DROP DEFAULT,
  ALTER COLUMN "stage" TYPE "TelegramCrmContactStage"
  USING (
    CASE "stage"::text
      WHEN 'QUALIFIED' THEN 'LEAD'
      WHEN 'FOLLOW_UP' THEN 'LEAD'
      WHEN 'ARCHIVED' THEN 'ANOTHER'
      ELSE "stage"::text
    END
  )::"TelegramCrmContactStage",
  ALTER COLUMN "stage" SET DEFAULT 'NEW';

DROP TYPE "TelegramCrmContactStage_old";
