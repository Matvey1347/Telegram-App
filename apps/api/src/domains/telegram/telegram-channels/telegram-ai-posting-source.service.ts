import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import * as https from 'node:https';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  isValidTelegramAiPostingSourceId,
  telegramAiPostingSourceWhere,
} from './telegram-ai-posting-source-policy';

type PostingSource = {
  id: string;
  type: string;
  value: string;
  enabled?: boolean;
  useImages?: boolean;
};
type ImageCandidate = { url: string; sourceId: string; sourceType: string };
export type TelegramAiPostingSourceStatus =
  | 'COLLECTED'
  | 'UNAVAILABLE'
  | 'INELIGIBLE'
  | 'EMPTY'
  | 'SKIPPED';
export type TelegramAiPostingSourceDiagnostic = {
  sourceId: string;
  sourceType: string;
  displayValue: string;
  status: TelegramAiPostingSourceStatus;
  reason?:
    | 'SOURCE_ID_INVALID'
    | 'SOURCE_NOT_ELIGIBLE'
    | 'SOURCE_CHECK_FAILED'
    | 'SOURCE_FETCH_FAILED'
    | 'COLLECTION_LIMIT'
    | 'SOURCE_TYPE_UNSUPPORTED';
};
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
function rssFeedText(value: string) {
  const entries = [...value.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .slice(0, 30)
    .map(([, , body]) => {
      const fields = [
        ...body.matchAll(
          /<(title|description|summary|content:encoded|content)\b[^>]*>([\s\S]*?)<\/\1>/gi,
        ),
      ].map(
        ([, name, content]) =>
          `${name}: ${content.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')}`,
      );
      return cleanMarkup(fields.join(' '));
    })
    .filter(Boolean);
  return entries.join('\n').slice(0, 12000);
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
function safeSourceValue(source: PostingSource) {
  if (source.type === 'telegram') return 'Telegram source';
  if (source.type === 'website' || source.type === 'rss') {
    try {
      return new URL(String(source.value ?? '')).hostname || 'Web source';
    } catch {
      return 'Web source';
    }
  }
  return 'Configured source';
}

@Injectable()
export class TelegramAiPostingSourceService {
  constructor(private readonly prisma: PrismaService) {}

  async checkWebSource(type: string, value: string) {
    try {
      const body = (await this.fetchPublic(value, MAX_SOURCE_BYTES)).toString(
        'utf8',
      );
      const text = type === 'rss' ? rssFeedText(body) : cleanMarkup(body);
      return text
        ? {
            ok: true,
            available: true,
            message:
              type === 'rss'
                ? 'Лента доступна, записи найдены.'
                : 'Страница доступна, текст найден.',
          }
        : {
            ok: false,
            available: true,
            message:
              type === 'rss'
                ? 'Лента доступна, но записи не найдены.'
                : 'Страница доступна, но текст не найден.',
          };
    } catch {
      return {
        ok: false,
        available: false,
        message: 'Не удалось получить источник. Проверьте адрес и доступность.',
      };
    }
  }

  async collect(input: {
    workspaceId: string;
    channelId: string;
    config: Record<string, any>;
    imageSelectionKey?: string;
  }) {
    const allSources = (
      Array.isArray(input.config.sources) ? input.config.sources : []
    ) as PostingSource[];
    const enabledSources = allSources.filter(
      (source) =>
        source && typeof source === 'object' && source.enabled !== false,
    );
    const enabled = enabledSources;
    const diagnostics: TelegramAiPostingSourceDiagnostic[] = enabledSources.map(
      (source) => ({
        sourceId: typeof source.id === 'string' ? source.id : '',
        sourceType: typeof source.type === 'string' ? source.type : 'unknown',
        displayValue: safeSourceValue(source),
        status: 'EMPTY',
      }),
    );
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
    const telegramSourceIds = [
      ...new Set(
        enabled
          .filter(
            (source) =>
              source.type === 'telegram' &&
              isValidTelegramAiPostingSourceId(source.value),
          )
          .map((source) => source.value),
      ),
    ];
    let eligibleTelegramSources = new Map<
      string,
      { title: string; username: string | null }
    >();
    let telegramEligibilityFailed = false;
    if (telegramSourceIds.length) {
      try {
        const eligible = await this.prisma.telegramChannel.findMany({
          where: telegramAiPostingSourceWhere(
            input.workspaceId,
            input.channelId,
            telegramSourceIds,
          ),
          select: { id: true, title: true, username: true },
        });
        eligibleTelegramSources = new Map(
          eligible.map((channel) => [channel.id, channel]),
        );
      } catch {
        telegramEligibilityFailed = true;
      }
    }
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
    for (const [sourceIndex, source] of enabled.entries()) {
      const diagnostic = diagnostics[sourceIndex];
      if (!['telegram', 'website', 'rss'].includes(String(source.type))) {
        diagnostic.status = 'SKIPPED';
        diagnostic.reason = 'SOURCE_TYPE_UNSUPPORTED';
        continue;
      }
      if (source.type === 'telegram') {
        if (!isValidTelegramAiPostingSourceId(source.value)) {
          diagnostic.status = 'INELIGIBLE';
          diagnostic.reason = 'SOURCE_ID_INVALID';
          continue;
        }
        if (telegramEligibilityFailed) {
          diagnostic.status = 'UNAVAILABLE';
          diagnostic.reason = 'SOURCE_CHECK_FAILED';
          continue;
        }
        const eligibleSource = eligibleTelegramSources.get(source.value);
        if (!eligibleSource) {
          diagnostic.status = 'INELIGIBLE';
          diagnostic.reason = 'SOURCE_NOT_ELIGIBLE';
          continue;
        }
        diagnostic.displayValue = eligibleSource.username
          ? `@${eligibleSource.username}`
          : eligibleSource.title || 'Telegram source';
        let posts: Array<{
          text: string | null;
          formattedText: string | null;
          imageUrls: string[];
          postDate: Date;
        }>;
        try {
          posts = await this.prisma.telegramPost.findMany({
            where: {
              workspaceId: input.workspaceId,
              telegramChannelId: source.value,
              // Recheck eligibility in the same query that reads source content,
              // so a concurrent deactivation or access revocation cannot leak it.
              telegramChannel: {
                is: telegramAiPostingSourceWhere(
                  input.workspaceId,
                  input.channelId,
                  [source.value],
                ),
              },
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
        } catch {
          diagnostic.status = 'UNAVAILABLE';
          diagnostic.reason = 'SOURCE_FETCH_FAILED';
          continue;
        }
        let hasUsableMaterial = false;
        for (const post of posts) {
          const text = (post.formattedText || post.text || '').trim();
          if (text) {
            hasUsableMaterial = true;
            contexts.push(
              `[telegram source ${source.id}] ${text.slice(0, 2000)}`,
            );
          }
          for (const url of source.useImages === false ? [] : post.imageUrls) {
            hasUsableMaterial = true;
            permittedSourceImages.push({
              url,
              sourceId: source.id,
              sourceType: 'telegram',
            });
          }
        }
        diagnostic.status = hasUsableMaterial ? 'COLLECTED' : 'EMPTY';
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
          const text =
            source.type === 'rss' ? rssFeedText(body) : cleanMarkup(body);
          let hasUsableMaterial = Boolean(text);
          if (text) contexts.push(`[${source.type} ${source.id}] ${text}`);
          if (source.useImages !== false)
            for (const url of urlsFromMarkup(body, source.value)) {
              hasUsableMaterial = true;
              permittedSourceImages.push({
                url,
                sourceId: source.id,
                sourceType: source.type,
              });
            }
          diagnostic.status = hasUsableMaterial ? 'COLLECTED' : 'EMPTY';
        } catch {
          diagnostic.status = 'UNAVAILABLE';
          diagnostic.reason = 'SOURCE_FETCH_FAILED';
        }
      } else {
        diagnostic.status = 'UNAVAILABLE';
        diagnostic.reason = 'SOURCE_FETCH_FAILED';
      }
    }
    const imageGroups = new Map<string, ImageCandidate[]>();
    for (const candidate of permittedSourceImages) {
      const group = imageGroups.get(candidate.sourceId) ?? [];
      if (group.length < 2) group.push(candidate);
      imageGroups.set(candidate.sourceId, group);
    }
    const groups = [...imageGroups.values()];
    const offset =
      groups.length > 1 && input.imageSelectionKey
        ? createHash('sha256')
            .update(input.imageSelectionKey)
            .digest()
            .readUInt32BE(0) % groups.length
        : 0;
    const rotated = [...groups.slice(offset), ...groups.slice(0, offset)];
    const sourceImages = rotated.slice(0, 2).map((group) => group[0]);
    if (sourceImages.length === 1 && rotated[0].length > 1)
      sourceImages.push(rotated[0][1]);
    const activePosts = priorPosts
      .filter((post) => Boolean(post.title?.trim() || post.text?.trim()))
      .map((post) => ({
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
          : history
              .filter((post) => Boolean((post.formattedText || post.text || '').trim()))
              .slice(0, 100)
              .map((post) => ({
              date: post.postDate.toISOString(),
              text: (post.formattedText || post.text || '').slice(0, 1500),
              })),
      existingPosts: activePosts,
      sourceContexts: contexts.slice(0, 100),
      imageCandidates: [...sourceImages, ...historyImages.slice(0, 1)],
      sourceDiagnostics: diagnostics,
      sourceRefs: diagnostics
        .filter((diagnostic) => diagnostic.status === 'COLLECTED')
        .map((diagnostic) => ({
          id: diagnostic.sourceId,
          type: diagnostic.sourceType,
          value: diagnostic.displayValue,
        })),
    };
  }

  async searchOpenImages(query: string, page = 1): Promise<ImageCandidate[]> {
    const url = new URL('https://api.openverse.org/v1/images/');
    url.searchParams.set('q', query.slice(0, 200));
    url.searchParams.set('license', 'cc0,pdm');
    url.searchParams.set('page_size', '10');
    url.searchParams.set('page', String(Math.max(1, Math.min(3, page))));
    const data: unknown = JSON.parse(
      (await this.fetchPublic(url.toString(), 512 * 1024)).toString('utf8'),
    );
    if (
      !data ||
      typeof data !== 'object' ||
      !('results' in data) ||
      !Array.isArray(data.results)
    )
      return [];
    return data.results
      .flatMap((item: unknown): ImageCandidate[] => {
        if (
          !item ||
          typeof item !== 'object' ||
          !('url' in item) ||
          typeof item.url !== 'string' ||
          !('license' in item) ||
          !['cc0', 'pdm'].includes(String(item.license).toLowerCase())
        )
          return [];
        try {
          const imageUrl = new URL(item.url);
          if (
            imageUrl.protocol !== 'https:' ||
            imageUrl.username ||
            imageUrl.password
          )
            return [];
          return [
            {
              url: imageUrl.toString(),
              sourceId: 'openverse',
              sourceType: 'image-search',
            },
          ];
        } catch {
          return [];
        }
      })
      .slice(0, 3);
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
              'application/json,text/html,application/rss+xml,application/atom+xml,image/*',
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
