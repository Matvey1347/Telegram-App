import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

type Example = {
  messageId: string;
  postDate: Date;
  caption: string;
  length: number;
  mediaKind: string | null;
  image: string | null;
  score24h: number | null;
  engagement: number | null;
  role: 'representative' | 'recent' | 'high' | 'low';
};

export async function readTelegramAiPostingChannelEvidence(
  prisma: PrismaService,
  workspaceId: string,
  channelId: string,
) {
  const scope = Prisma.sql`from "TelegramPost" p
    left join "TelegramPostPerformance" f on f."telegramPostId" = p.id
    where p."workspaceId" = ${workspaceId} and p."telegramChannelId" = ${channelId}`;
  const organic = Prisma.sql`not p."excludeFromAnalytics"
    and not coalesce(f."excludedFromNorm", false)
    and coalesce(f.origin, '') not in ('AD', 'MUTUAL_PROMO')
    and not exists (select 1 from "TelegramAdSalePlacement" a where a."telegramPostId" = p.id)`;

  const [[coverage], examples] = await Promise.all([
    prisma.$queryRaw<Array<{
      organicPosts: number;
      excludedPosts: number;
      scoredPosts: number;
      firstPost: Date | null;
      lastPost: Date | null;
      mediaPosts: number;
      medianLength: number | null;
      medianEngagement24h: number | null;
      questionPosts: number;
      postsWithLinks: number;
      lengthBands: Array<{ band: string; posts: number; scored: number; medianScore24h: number | null }>;
    }>>`
      with history as (
        select ${organic} as organic, p."postDate", p."hasMedia", f."score24h",
          f."engagementPer1k24h", f."hasLink", f."endsWithQuestion",
          length(coalesce(p.text, p."formattedText", '')) as chars
        ${scope}
      ), bands as (
        select case when chars < 100 then '0–99' when chars < 300 then '100–299'
          when chars < 700 then '300–699' when chars < 1200 then '700–1199'
          else '1200+' end as band,
          count(*)::int as posts, count("score24h")::int as scored,
          percentile_cont(0.5) within group (order by "score24h") as "medianScore24h"
        from history where organic
        group by 1
      )
      select count(*) filter (where organic)::int as "organicPosts",
        count(*) filter (where not organic)::int as "excludedPosts",
        count("score24h") filter (where organic)::int as "scoredPosts",
        min("postDate") filter (where organic) as "firstPost",
        max("postDate") filter (where organic) as "lastPost",
        count(*) filter (where organic and "hasMedia")::int as "mediaPosts",
        percentile_cont(0.5) within group (order by chars) filter (where organic) as "medianLength",
        count(*) filter (where organic and "endsWithQuestion")::int as "questionPosts",
        count(*) filter (where organic and "hasLink")::int as "postsWithLinks",
        percentile_cont(0.5) within group (order by "engagementPer1k24h") filter (where organic) as "medianEngagement24h",
        coalesce((select jsonb_agg(bands order by band) from bands), '[]'::jsonb) as "lengthBands"
      from history`,
    prisma.$queryRaw<Example[]>`
      with history as materialized (
        select p.id, p."postDate", f."score24h", f."engagementPer1k24h",
          row_number() over (order by p."postDate", p.id) as position,
          count(*) over () as total
        ${scope} and ${organic}
        and length(trim(coalesce(nullif(p.text, ''), p."formattedText", ''))) > 0
      ), sample as (
        (select id, 'recent' as role from history order by "postDate" desc, id limit 15)
        union all
        (select id, 'representative' from history where position % greatest(1, ceil(total / 48.0)) = 0)
        union all
        (select id, 'high' from history where "score24h" is not null order by "score24h" desc, id limit 8)
        union all
        (select id, 'low' from history where "score24h" is not null order by "score24h", id limit 10)
      )
      select sample.role, p."telegramMessageId" as "messageId",
        h."postDate", left(coalesce(nullif(p."formattedText", ''), p.text, ''), 700) as caption,
        length(coalesce(p.text, p."formattedText", '')) as length,
        p."mediaKind", left(p."imageUrls"[1], 2000) as image, h."score24h",
        h."engagementPer1k24h" as engagement
      from sample
      join history h on h.id = sample.id
      join "TelegramPost" p on p.id = sample.id
      order by sample.role, h."postDate", p.id`,
  ]);
  const byDate = (a: Example, b: Example) => +a.postDate - +b.postDate;
  const representative = examples.filter((row) => row.role === 'representative').sort(byDate);
  const rankedImages = [
    ...examples.filter((row) => row.role === 'recent').sort(byDate).reverse().slice(0, 4),
    ...examples.filter((row) => row.role === 'high').slice(0, 2),
    ...representative.filter((_row, index) => index % Math.max(1, Math.floor(representative.length / 5)) === 0),
  ];
  return {
    coverage,
    examples,
    images: [...new Set(rankedImages.flatMap(({ image }) => image ? [image] : []))].slice(0, 8),
  };
}

export async function sampleTelegramAiPostingEditorialImages(
  prisma: PrismaService,
  workspaceId: string,
  channelId: string,
  published: string[],
) {
  const settingsScope = {
    workspaceId, telegramChannelId: channelId,
    imageUrls: { isEmpty: false },
    adSalePlacements: { none: {} },
    mutualPromotionDelivery: { is: null },
    postBatchDelivery: { is: null },
  } as const;
  const [drafts, scheduled] = await Promise.all(
    (['DRAFT', 'SCHEDULED'] as const).map((status) =>
      prisma.telegramManagedPost.findMany({
        where: { ...settingsScope, status },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 12,
        select: { imageUrls: true },
      }),
    ),
  );
  const examples = [drafts[0], scheduled[0], drafts[6], scheduled[6]]
    .flatMap((post) => post?.imageUrls[0] ? [post.imageUrls[0]] : []);
  return [...new Set([...examples, ...published])].slice(0, 8);
}
