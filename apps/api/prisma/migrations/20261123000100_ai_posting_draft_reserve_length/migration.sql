UPDATE "TelegramManagedPost" p
SET "aiPostingSphereId" = s.id,
    "aiPostingRubricId" = r.id,
    "aiPostingLengthId" = l."lengthId"
FROM "TelegramAiPostingGeneration" g
JOIN "TelegramAiPostingSphere" s
  ON s.id = g."modelUsage"#>>'{editorialMetadata,sphere,id}'
 AND s."workspaceId" = g."workspaceId"
 AND s."telegramChannelId" = g."telegramChannelId"
JOIN "TelegramAiPostingRubric" r
  ON r.id = g."modelUsage"#>>'{editorialMetadata,rubric,id}'
 AND r."workspaceId" = g."workspaceId"
 AND r."telegramChannelId" = g."telegramChannelId"
 AND (r."sphereId" IS NULL OR r."sphereId" = s.id)
LEFT JOIN "TelegramAiPostingRubricLength" l
  ON l."rubricId" = r.id
 AND l."lengthId" = g."telegramChannelId" || '::' || (g."modelUsage"#>>'{editorialMetadata,length,id}')
WHERE p.id = g."managedPostId"
  AND p."workspaceId" = g."workspaceId"
  AND p."telegramChannelId" = g."telegramChannelId"
  AND p."aiPostingSphereId" IS NULL
  AND p."aiPostingRubricId" IS NULL
  AND p.status = 'DRAFT'
  AND p.origin = 'SYSTEM'
  AND NOT EXISTS (
    SELECT 1 FROM "PostGroup" grp WHERE grp.id = p."groupId"
      AND (grp."isSystem" OR grp."systemKey" IS NOT NULL)
  )
  AND NOT EXISTS (SELECT 1 FROM "TelegramAdSalePlacement" a WHERE a."managedPostId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "MutualPromotionPostDelivery" v WHERE v."managedPostId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "TelegramPostBatchDelivery" b WHERE b."managedPostId" = p.id);
