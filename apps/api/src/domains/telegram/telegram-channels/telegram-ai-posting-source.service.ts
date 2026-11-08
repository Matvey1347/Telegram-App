import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as https from 'node:https';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

type PostingSource = {
  id: string;
  type: string;
  value: string;
  enabled?: boolean;
  rightsConfirmed?: boolean;
};
type ImageCandidate = { url: string; sourceId: string; sourceType: string };
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const privateIpv4 = (ip: string) => {
  const p = ip.split('.').map(Number);
  return (
    p[0] === 0 ||
    p[0] === 10 ||
    p[0] === 127 ||
    p[0] >= 224 ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && (p[1] === 168 || (p[1] === 0 && p[2] === 0))) ||
    (p[0] === 198 && (p[1] === 18 || p[1] === 19))
  );
};
function publicAddress(ip: string) {
  const version = isIP(ip);
  if (version === 4) return !privateIpv4(ip);
  if (version === 6)
    return ip.toLowerCase().startsWith('2') || ip.toLowerCase().startsWith('3');
  return false;
}
function cleanMarkup(value: string) {
  return value
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}
function urlsFromMarkup(markup: string, base: string) {
  const found: string[] = [];
  for (const match of markup.matchAll(
    /<(?:img|enclosure|media:content)[^>]*(?:src|url)=["']([^"']+)["'][^>]*>/gi,
  )) {
    try {
      const url = new URL(match[1], base);
      if (url.protocol === 'https:') found.push(url.toString());
    } catch {
      /* ignore malformed markup */
    }
  }
  return [...new Set(found)].slice(0, 12);
}

@Injectable()
export class TelegramAiPostingSourceService {
  constructor(private readonly prisma: PrismaService) {}

  async collect(input: {
    workspaceId: string;
    channelId: string;
    config: Record<string, any>;
  }) {
    const allSources = (
      Array.isArray(input.config.sources) ? input.config.sources : []
    ) as PostingSource[];
    const enabled = allSources
      .filter((source) => source.enabled !== false)
      .slice(0, 5);
    const historyMode = input.config.historyMode ?? 'all';
    const since =
      historyMode === 'since'
        ? new Date(`${input.config.historyFrom}T00:00:00.000Z`)
        : undefined;
    const [channel, priorPosts] = await Promise.all([
      this.prisma.telegramChannel.findFirstOrThrow({
        where: { id: input.channelId, workspaceId: input.workspaceId },
        select: {
          title: true,
          username: true,
          niche: true,
          shortDescription: true,
          description: true,
          language: true,
        },
      }),
      this.prisma.telegramManagedPost.findMany({
        where: {
          workspaceId: input.workspaceId,
          telegramChannelId: input.channelId,
          ...(historyMode === 'none'
            ? { status: { in: ['DRAFT', 'SCHEDULED'] } }
            : since
              ? {
                  OR: [
                    { status: { in: ['DRAFT', 'SCHEDULED'] } },
                    { createdAt: { gte: since } },
                  ],
                }
              : {}),
        },
        select: { title: true, text: true, status: true, scheduledAt: true },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    ]);
    const history =
      historyMode === 'none'
        ? []
        : await this.prisma.telegramPost.findMany({
            where: {
              workspaceId: input.workspaceId,
              telegramChannelId: input.channelId,
              ...(since ? { postDate: { gte: since } } : {}),
            },
            select: {
              text: true,
              formattedText: true,
              postDate: true,
              imageUrls: true,
            },
            orderBy: { postDate: 'desc' },
            take: 200,
          });
    const contexts: string[] = [];
    const historyImages: ImageCandidate[] = [];
    const permittedSourceImages: ImageCandidate[] = [];
    if (historyMode !== 'none') {
      for (const post of history) {
        const text = (post.formattedText || post.text || '').trim();
        if (text)
          contexts.push(
            `[history ${post.postDate.toISOString().slice(0, 10)}] ${text.slice(0, 2500)}`,
          );
        for (const url of post.imageUrls)
          historyImages.push({
            url,
            sourceId: 'channel-history',
            sourceType: 'history',
          });
      }
    }
    for (const source of enabled) {
      if (source.type === 'telegram' && source.value) {
        const channelSource = await this.prisma.telegramChannel.findFirst({
          where: {
            id: source.value,
            workspaceId: input.workspaceId,
            isActive: true,
          },
          select: { id: true },
        });
        if (!channelSource) continue;
        const posts = await this.prisma.telegramPost.findMany({
          where: {
            workspaceId: input.workspaceId,
            telegramChannelId: source.value,
          },
          select: {
            text: true,
            formattedText: true,
            imageUrls: true,
            postDate: true,
          },
          orderBy: { postDate: 'desc' },
          take: 30,
        });
        for (const post of posts) {
          const text = (post.formattedText || post.text || '').trim();
          if (text)
            contexts.push(
              `[telegram source ${source.id}] ${text.slice(0, 2000)}`,
            );
          for (const url of post.imageUrls)
            permittedSourceImages.push({ url, sourceId: source.id, sourceType: 'telegram' });
        }
      } else if (
        (source.type === 'website' || source.type === 'rss') &&
        source.value
      ) {
        try {
          const response = await this.fetchPublic(
            source.value,
            MAX_SOURCE_BYTES,
          );
          const body = response.toString('utf8');
          contexts.push(`[${source.type} ${source.id}] ${cleanMarkup(body)}`);
          if (source.rightsConfirmed === true)
            for (const url of urlsFromMarkup(body, source.value))
              permittedSourceImages.push({
                url,
                sourceId: source.id,
                sourceType: source.type,
              });
        } catch {
          /* unusable source is skipped; broken input never becomes a post media URL */
        }
      }
    }
    const activePosts = priorPosts.map((post) => ({
      title: post.title,
      text: post.text,
      status: post.status,
      scheduledAt: post.scheduledAt?.toISOString() ?? null,
    }));
    return {
      editorialProfile: { ...channel, ...input.config },
      history:
        historyMode === 'none'
          ? []
          : history.slice(0, 100).map((post) => ({
              date: post.postDate.toISOString(),
              text: (post.formattedText || post.text || '').slice(0, 1500),
            })),
      existingPosts: activePosts,
      sourceContexts: contexts.slice(0, 100),
      imageCandidates: [
        ...permittedSourceImages.slice(0, 2),
        ...historyImages.slice(0, 1),
      ],
      sourceRefs: enabled.map((source) => ({
        id: source.id,
        type: source.type,
        value: source.value,
      })),
    };
  }

  async downloadImage(urlValue: string) {
    const bytes = await this.fetchPublic(urlValue, 5 * 1024 * 1024);
    if (bytes.length < 256) throw new Error('AI_POSTING_IMAGE_EMPTY');
    return bytes;
  }

  private async fetchPublic(value: string, limit: number) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('AI_POSTING_SOURCE_URL_INVALID');
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (
      !addresses.length ||
      addresses.some((item) => !publicAddress(item.address))
    )
      throw new Error('AI_POSTING_SOURCE_HOST_BLOCKED');
    const pinned = addresses[0];
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const request = https.request(
        {
          hostname: url.hostname,
          port: 443,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          servername: url.hostname,
          headers: {
            Accept:
              'text/html,application/rss+xml,application/atom+xml,image/*',
          },
          lookup: ((
            _hostname: string,
            options: unknown,
            callback: (...args: any[]) => void,
          ) => {
            const family = pinned.family as 4 | 6;
            const record = { address: pinned.address, family };
            if ((options as { all?: boolean })?.all) callback(null, [record]);
            else callback(null, record.address, record.family);
          }) as never,
        },
        (response) => {
          if (
            (response.statusCode ?? 0) < 200 ||
            (response.statusCode ?? 0) >= 300
          ) {
            response.destroy();
            reject(new Error('AI_POSTING_SOURCE_UNAVAILABLE'));
            return;
          }
          if (Number(response.headers['content-length'] ?? 0) > limit) {
            response.destroy();
            reject(new Error('AI_POSTING_SOURCE_TOO_LARGE'));
            return;
          }
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > limit) {
              response.destroy(new Error('AI_POSTING_SOURCE_TOO_LARGE'));
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        },
      );
      request.setTimeout(8000, () =>
        request.destroy(new Error('AI_POSTING_SOURCE_TIMEOUT')),
      );
      request.on('error', reject);
      request.end();
    });
  }
}
