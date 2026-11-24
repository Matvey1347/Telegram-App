-- The original receiver returned the greeting in the webhook response, so it
-- recorded the command but never received a Telegram delivery confirmation.
-- Keep one historical greeting per ticket and never send it again.
INSERT INTO "TelegramSupportMessage" (
    "id", "ticketId", "workspaceId", "product", "text", "automatic", "formatted", "status", "createdAt"
)
SELECT
    'legacy-auto:' || start_message."ticketId",
    start_message."ticketId",
    start_message."workspaceId",
    start_message."product",
    'Thank you for contacting '
        || CASE start_message."product" WHEN 'GROSHLY' THEN 'Groshly' ELSE 'Nexeloq' END
        || ' Support. An administrator will reply here shortly. You can describe your issue in this chat.',
    TRUE,
    FALSE,
    'UNKNOWN',
    start_message."createdAt" + INTERVAL '1 millisecond'
FROM (
    SELECT DISTINCT ON ("ticketId") "ticketId", "workspaceId", "product", "createdAt"
    FROM "TelegramSupportMessage"
    WHERE "status" = 'INBOUND'
      AND "updateId" IS NOT NULL
      AND "text" ~* '^/start(@[a-z0-9_]+)?([[:space:]]|$)'
      AND "createdAt" < (
          SELECT MAX("started_at") AT TIME ZONE 'UTC'
          FROM "_prisma_migrations"
          WHERE "migration_name" = '20261124123400_support_message_presentation'
            AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
      )
    ORDER BY "ticketId", "createdAt" DESC, "id" DESC
) AS start_message
ON CONFLICT ("id") DO NOTHING;
