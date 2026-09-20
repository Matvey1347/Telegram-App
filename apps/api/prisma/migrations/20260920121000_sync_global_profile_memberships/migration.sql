UPDATE "WorkspaceMember" AS member
SET
  "avatarIconId" = user_row."profileAvatarIconId",
  "telegramUsername" = user_row."telegramUsername",
  "updatedAt" = NOW()
FROM "User" AS user_row
WHERE member."userId" = user_row.id
  AND (
    member."avatarIconId" IS DISTINCT FROM user_row."profileAvatarIconId"
    OR member."telegramUsername" IS DISTINCT FROM user_row."telegramUsername"
  );
