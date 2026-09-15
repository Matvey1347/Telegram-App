UPDATE "TelegramManagedPost"
SET
  "telegramIdVerificationStatus" = 'UNVERIFIED',
  "telegramIdLastCheckedAt" = NULL
WHERE
  "status" = 'SCHEDULED'
  AND "scheduledAt" IS NOT NULL
  AND "scheduledAt" <= CURRENT_TIMESTAMP;
