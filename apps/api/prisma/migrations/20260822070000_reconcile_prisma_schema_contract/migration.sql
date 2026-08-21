-- The add-column migration used a default to backfill existing chat flows.
-- New flows always declare their operation explicitly, matching schema.prisma.
ALTER TABLE "FinanceChatFlow"
ALTER COLUMN "operationKind" DROP DEFAULT;

-- Keep the database default synchronized with the canonical Prisma contract.
ALTER TABLE "TelegramChannel"
ALTER COLUMN "kpiCurrency" SET DEFAULT 'USD';
