INSERT INTO "TelegramBotApplicationWorkspaceAccess" (
  "id",
  "workspaceId",
  "applicationType",
  "enabled",
  "createdAt",
  "updatedAt"
)
VALUES (
  'finance-access-cmptsyujx0001flritxdrq84b',
  'cmptsyujx0001flritxdrq84b',
  'FINANCE',
  true,
  NOW(),
  NOW()
)
ON CONFLICT ("workspaceId", "applicationType")
DO UPDATE SET "enabled" = true, "updatedAt" = NOW();
