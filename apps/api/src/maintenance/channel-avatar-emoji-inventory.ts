import { PrismaService } from '../prisma/prisma.service';

export type AvatarEmojiInventoryRow = {
  totalCount?: number;
  remainingCount?: number;
  id: string;
  title: string;
  owned: boolean;
  hasStoredAvatar: boolean;
  avatarEmojiIconId: string | null;
  avatarEmojiHash: string | null;
  avatarEmojiStatus: string | null;
  avatarEmojiManual: boolean;
  generatedIconName: string | null;
  generatedIconSource: string | null;
};

/** Compatible read-only planning even before the avatar schema is deployed. */
export async function avatarEmojiInventory(
  prisma: PrismaService,
  workspaceId: string,
  limit: number,
  after?: string,
) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true },
  });
  if (!workspace) throw new Error('Workspace not found.');
  const rows = await prisma.$queryRaw<AvatarEmojiInventoryRow[]>`
    SELECT (SELECT count(*)::int FROM "TelegramChannel" all_channels WHERE all_channels."workspaceId" = ${workspaceId}) AS "totalCount",
      (SELECT count(*)::int FROM "TelegramChannel" remaining WHERE remaining."workspaceId" = ${workspaceId} AND remaining."id" > ${after ?? ''}) AS "remainingCount",
      c."id", c."title", NULLIF(c."photoUrl", '') IS NOT NULL AS "hasStoredAvatar",
      EXISTS(SELECT 1 FROM "TelegramChannelSourceAccess" a WHERE a."workspaceId" = c."workspaceId"
        AND a."channelId" = c."id" AND a."sourceType" = 'MTPROTO' AND a."role" = 'OWNER') AS "owned",
      to_jsonb(c)->>'avatarEmojiIconId' AS "avatarEmojiIconId",
      to_jsonb(c)->>'avatarEmojiHash' AS "avatarEmojiHash",
      to_jsonb(c)->>'avatarEmojiStatus' AS "avatarEmojiStatus",
      COALESCE((to_jsonb(c)->>'avatarEmojiManual')::boolean, c."presentationIconId" IS NOT NULL) AS "avatarEmojiManual",
      i."name" AS "generatedIconName", i."emoji" AS "generatedIconSource"
    FROM "TelegramChannel" c LEFT JOIN "Icon" i ON i."id" = (to_jsonb(c)->>'avatarEmojiIconId')
    WHERE c."workspaceId" = ${workspaceId} AND c."id" > ${after ?? ''} ORDER BY c."id" LIMIT ${limit}
  `;
  const schema = await prisma.$queryRaw<Array<{ ready: boolean }>>`
    SELECT to_regclass('"ChannelAvatarEmojiAsset"') IS NOT NULL AND to_regclass('"ChannelAvatarEmojiPack"') IS NOT NULL
      AND to_regclass('"ChannelAvatarEmojiPublisher"') IS NOT NULL
      AND (SELECT count(*) = 2 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='ChannelAvatarEmojiAsset' AND column_name IN ('pendingDocumentIds','remotePending'))
      AND (SELECT count(*) = 7 FROM information_schema.columns WHERE table_schema=current_schema()
        AND table_name='TelegramChannel' AND column_name IN ('avatarEmojiIconId','avatarEmojiHash','avatarEmojiStatus','avatarEmojiError','avatarEmojiManual','avatarEmojiRetryAt','avatarEmojiAttempts')) AS "ready"
  `;
  const packs = schema[0]?.ready
    ? await prisma.channelAvatarEmojiPack.findMany({
        select: { id: true, shortName: true },
        orderBy: { id: 'asc' },
      })
    : [];
  const emptyPageTotal =
    rows.length === 0
      ? await prisma.$queryRaw<Array<{ total: number }>>`
    SELECT count(*)::int AS "total" FROM "TelegramChannel" WHERE "workspaceId" = ${workspaceId}
  `
      : [];
  const totalChannels =
    rows[0]?.totalCount ?? emptyPageTotal[0]?.total ?? rows.length;
  const remainingChannels = rows[0]?.remainingCount ?? rows.length;
  const nextCursor =
    remainingChannels > rows.length ? (rows.at(-1)?.id ?? null) : null;
  return {
    totalChannels,
    remainingChannels,
    nextCursor,
    workspace,
    schemaReady: schema[0]?.ready ?? false,
    packs,
    rows,
  };
}
