import { Prisma } from '@prisma/client';
/** Shared aliases c/q. Snapshot invalidation compares meaning, not source traffic timestamps. */
export const leadQualificationSnapshotCurrent = Prisma.sql`
 q."requestSnapshot"->'candidateFacts'=jsonb_build_object('title',c.title,'niche',c.niche,'offerType',c."offerType",'contacts',c.contacts,'reviewStatus',c."reviewStatus",'riskStatus',c."riskStatus",'contactId',c."contactId")
 AND jsonb_array_length(COALESCE(q."requestSnapshot"->'checks','[]'::jsonb))>0
 AND (SELECT jsonb_agg(latest.id ORDER BY latest."observedAt" DESC,latest.id DESC) FROM(SELECT o.id,o."observedAt" FROM "TelegramLeadObservation" o WHERE o."workspaceId"=c."workspaceId" AND o."candidateId"=c.id AND o."originalStatus"='OBSERVED' AND o."reviewStatus"<>'REJECTED' AND o."expiresAt">(NOW() AT TIME ZONE 'UTC') ORDER BY o."observedAt" DESC,o.id DESC LIMIT 5) latest)=(SELECT jsonb_agg(ref->>'id') FROM jsonb_array_elements(q."requestSnapshot"->'checks') ref)
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(q."requestSnapshot"->'checks','[]'::jsonb)) ref
 LEFT JOIN "TelegramLeadObservation" o ON o.id=ref->>'id' AND o."workspaceId"=c."workspaceId"
 LEFT JOIN "TelegramLeadSource" s ON s.id=o."sourceId" AND s."workspaceId"=c."workspaceId"
 WHERE o.id IS NULL OR o."contentHash"<>ref->>'hash' OR o."originalStatus"<>'OBSERVED' OR o."reviewStatus"='REJECTED' OR o."expiresAt"<=(NOW() AT TIME ZONE 'UTC')
 OR COALESCE(o.classification,'null'::jsonb) IS DISTINCT FROM ref->'classification' OR o."classificationVersion" IS DISTINCT FROM ref->>'classificationVersion' OR o."extractionVersion" IS DISTINCT FROM ref->>'extractionVersion'
 OR jsonb_build_object('title',s.title,'accountId',s."accountId",'channelId',s."channelId",'reference',s."processingReference",'status',s."monitoringState",'own',s."allowOwnChannel") IS DISTINCT FROM ref->'source')
 AND (q."requestSnapshot"->>'freshness')::boolean = EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(q."requestSnapshot"->'checks','[]'::jsonb)) ref JOIN "TelegramLeadObservation" o ON o.id=ref->>'id' AND o."workspaceId"=c."workspaceId" WHERE COALESCE(o."editedAt",o."publishedAt")>(NOW() AT TIME ZONE 'UTC')-INTERVAL '30 days')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(q."requestSnapshot"->'channels','[]'::jsonb)) ref LEFT JOIN "TelegramChannel" ch ON ch.id=ref->>'id' AND ch."workspaceId"=c."workspaceId" WHERE ch.id IS NULL OR NOT ch."isActive" OR NOT EXISTS(SELECT 1 FROM "TelegramChannelAdminLink" admin WHERE admin."telegramChannelId"=ch.id AND admin."workspaceId"=c."workspaceId") OR jsonb_build_object('id',ch.id,'title',LEFT(ch.title,300),'niche',LEFT(ch.niche,300),'shortDescription',LEFT(ch."shortDescription",500),'language',ch.language) IS DISTINCT FROM ref)
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(q."requestSnapshot"->'products','[]'::jsonb)) ref LEFT JOIN "TelegramAdProduct" p ON p.id=ref->>'id' AND p."workspaceId"=c."workspaceId" WHERE p.id IS NULL OR NOT p."isActive" OR p."updatedAt"<>(ref->>'updatedAt')::timestamp)
`;
