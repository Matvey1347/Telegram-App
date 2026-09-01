import {
  Prisma,
  TelegramCrmContactStage,
  TelegramCrmConversationState,
  TelegramCrmMessageDirection,
  TelegramCrmReadState,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CRM_OPEN_TASK_STATUSES } from './telegram-crm-contact-read-model';
import { CrmContactsQueryDto } from './telegram-crm.dto';

type ContactIdRow = { id: string };
type CountRow = { count: number };

export async function loadCrmReadNoReplyPage(
  prisma: PrismaService,
  workspaceId: string,
  ownership: { assignedMemberId: string } | Record<string, never>,
  query: CrmContactsQueryDto,
  pagination: { skip: number; take: number },
  due: Prisma.DateTimeFilter | null,
) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`advertiser."workspaceId" = ${workspaceId}`,
    Prisma.sql`advertiser."lastOutboundAt" IS NOT NULL`,
    Prisma.sql`(
      advertiser."lastInboundAt" IS NULL
      OR advertiser."lastOutboundAt" > advertiser."lastInboundAt"
    )`,
    Prisma.sql`(
      SELECT message."readState"::text
      FROM "TelegramCrmMessage" message
      INNER JOIN "TelegramCrmConversation" conversation
        ON conversation."id" = message."conversationId"
        AND conversation."workspaceId" = message."workspaceId"
      WHERE conversation."workspaceId" = advertiser."workspaceId"
        AND conversation."contactId" = advertiser."id"
        AND conversation."state"::text = ${TelegramCrmConversationState.ACTIVE}
        AND message."direction"::text = ${TelegramCrmMessageDirection.OUTBOUND}
        AND (
          advertiser."lastInboundAt" IS NULL
          OR message."sentAt" > advertiser."lastInboundAt"
        )
      ORDER BY message."sentAt" DESC, message."id" DESC
      LIMIT 1
    ) = ${TelegramCrmReadState.READ}`,
  ];
  if ('assignedMemberId' in ownership) {
    conditions.push(
      Prisma.sql`advertiser."ownerMemberId" = ${ownership.assignedMemberId}`,
    );
  } else if (query.ownerMemberId) {
    conditions.push(
      Prisma.sql`advertiser."ownerMemberId" = ${query.ownerMemberId}`,
    );
  }
  if (query.stage) {
    conditions.push(Prisma.sql`advertiser."stage"::text = ${query.stage}`);
  }
  if (query.archived === true) {
    conditions.push(
      Prisma.sql`advertiser."stage"::text = ${TelegramCrmContactStage.ARCHIVED}`,
    );
  } else if (query.archived === false) {
    conditions.push(
      Prisma.sql`advertiser."stage"::text <> ${TelegramCrmContactStage.ARCHIVED}`,
    );
  }
  if (due) {
    const dueConditions: Prisma.Sql[] = [
      Prisma.sql`task."workspaceId" = advertiser."workspaceId"`,
      Prisma.sql`task."advertiserId" = advertiser."id"`,
      Prisma.sql`task."status"::text IN (${Prisma.join(CRM_OPEN_TASK_STATUSES)})`,
    ];
    if (due.gte instanceof Date) {
      dueConditions.push(Prisma.sql`task."dueAt" >= ${due.gte}`);
    }
    if (due.lte instanceof Date) {
      dueConditions.push(Prisma.sql`task."dueAt" <= ${due.lte}`);
    }
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1
      FROM "TelegramAdvertiserTask" task
      WHERE ${Prisma.join(dueConditions, ' AND ')}
    )`);
  }
  const search = query.search?.trim();
  if (search) {
    const contains = `%${search}%`;
    const username = `%${search.replace(/^@+/, '')}%`;
    conditions.push(Prisma.sql`(
      advertiser."displayName" ILIKE ${contains}
      OR advertiser."companyName" ILIKE ${contains}
      OR advertiser."telegramUsername" ILIKE ${username}
      OR advertiser."phone" ILIKE ${contains}
      OR advertiser."email" ILIKE ${contains}
    )`);
  }
  const predicate = Prisma.join(conditions, ' AND ');
  const [ids, totals] = await Promise.all([
    prisma.$queryRaw<ContactIdRow[]>(Prisma.sql`
      SELECT advertiser."id"
      FROM "TelegramAdvertiser" advertiser
      WHERE ${predicate}
      ORDER BY advertiser."updatedAt" DESC, advertiser."id" DESC
      OFFSET ${pagination.skip}
      LIMIT ${pagination.take}
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM "TelegramAdvertiser" advertiser
      WHERE ${predicate}
    `),
  ]);
  return {
    ids: ids.map((row) => row.id),
    totalItems: totals[0]?.count ?? 0,
  };
}
