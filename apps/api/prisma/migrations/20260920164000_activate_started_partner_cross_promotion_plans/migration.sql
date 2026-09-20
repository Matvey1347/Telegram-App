-- A partner channel is external to our Telegram account, so it cannot provide
-- a managed-post receipt. Its scheduled time is the authoritative activity
-- signal for the mutual-promotion plan.
UPDATE "CrossPromotionPlan" AS plan
SET
  status = 'ACTIVE',
  "lastError" = NULL
WHERE plan.status = 'SCHEDULED'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      COALESCE(plan."publicationPost" -> 'partnerPlacements', '[]'::jsonb)
    ) AS placement
    WHERE (placement ->> 'scheduledAt')::timestamptz <= NOW()
  );
