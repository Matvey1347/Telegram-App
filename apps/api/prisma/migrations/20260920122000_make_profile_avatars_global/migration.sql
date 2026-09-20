INSERT INTO "Icon" (
  id,
  "workspaceId",
  type,
  name,
  emoji,
  "imageUrl",
  "createdByUserId",
  "createdAt",
  "updatedAt"
)
SELECT
  'global-profile-avatar-' || md5(user_row.id),
  NULL,
  source_icon.type,
  'profile-avatar:' || user_row.id,
  source_icon.emoji,
  source_icon."imageUrl",
  user_row.id,
  NOW(),
  NOW()
FROM "User" AS user_row
JOIN "Icon" AS source_icon ON source_icon.id = user_row."profileAvatarIconId"
WHERE source_icon."workspaceId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Icon" AS existing
    WHERE existing."workspaceId" IS NULL
      AND existing."createdByUserId" = user_row.id
      AND existing.name = 'profile-avatar:' || user_row.id
  );

UPDATE "User" AS user_row
SET "profileAvatarIconId" = profile_icon.id
FROM "Icon" AS profile_icon
WHERE profile_icon."workspaceId" IS NULL
  AND profile_icon."createdByUserId" = user_row.id
  AND profile_icon.name = 'profile-avatar:' || user_row.id;

UPDATE "WorkspaceMember" AS member
SET "avatarIconId" = user_row."profileAvatarIconId", "updatedAt" = NOW()
FROM "User" AS user_row
WHERE member."userId" = user_row.id
  AND member."avatarIconId" IS DISTINCT FROM user_row."profileAvatarIconId";
