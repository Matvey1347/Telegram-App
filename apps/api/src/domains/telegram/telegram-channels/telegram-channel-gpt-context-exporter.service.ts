import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { TELEGRAM_RICH_FORMATTING_GUIDE } from '../../../telegram/shared/telegram-rich-markup';

@Injectable()
export class TelegramChannelGptContextExporter {
  constructor(private readonly prisma: PrismaService, private readonly workspaces: WorkspaceService) {}
  async export(userId: string, channelId: string) {
    const workspaceId = await this.workspaces.resolveWorkspaceIdForUser(userId);
    const [channel, posts, links, groups] = await Promise.all([
      this.prisma.telegramChannel.findFirst({ where: { id: channelId, workspaceId }, select: { id: true, title: true, username: true } }),
      this.prisma.telegramManagedPost.findMany({ where: { workspaceId, telegramChannelId: channelId }, select: { id: true, title: true, status: true, imageUrls: true, text: true, createdAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      this.prisma.telegramChannelCustomEmojiPack.findMany({ where: { channelId, pack: { workspaceId } }, select: { pack: { select: { title: true, shortName: true, telegramLink: true, emojis: { orderBy: { position: 'asc' }, select: { documentId: true, alt: true } } } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.postGroup.findMany({ where: { workspaceId, telegramChannelId: channelId }, select: { id: true, title: true }, orderBy: { title: 'asc' } }),
    ]);
    if (!channel) throw new NotFoundException('Telegram channel not found.');
    const content = [
      'TELEGRAM GPT CONTEXT', 'FORMAT VERSION: 1', `CHANNEL: ${channel.title}`, `CHANNEL_ID: ${channel.id}`, `EXPORTED_AT: ${new Date().toISOString()}`, '', 'GPT RULES', 'This is the canonical source of truth for this channel. Return canonical post text exactly; do not change tg-post IDs; do not invent Premium Emoji document IDs.', '', 'ALL FORMATTING', TELEGRAM_RICH_FORMATTING_GUIDE, '', 'PREMIUM EMOJI',
      ...links.flatMap(({ pack }) => [`PACK\ntitle: ${pack.title}\nshort_name: ${pack.shortName}\ntelegram_link: ${pack.telegramLink}`, ...pack.emojis.map((emoji) => `EMOJI\nid: ${emoji.documentId}\nalt: ${emoji.alt}\nsyntax: ![${emoji.alt}](tg://emoji?id=${emoji.documentId})`)]), '', 'POST GROUPS', ...(groups.length ? groups.map((group) => `- ${group.title} — ${group.id}`) : ['[]']), '', 'MANAGED POST IMPORT JSON', 'Return a JSON array with title, text, icon, urls, groupId, groupPosition, scheduledAt, imported, approved, imageSearch. For new generated posts use imported: false and approved: false. Use an exact groupId from POST GROUPS; use groupId: null when no group is needed. Never invent an ID.', '[{"title":"Post title","text":"Telegram-ready post text","icon":"🔥","urls":[],"groupId":null,"groupPosition":null,"scheduledAt":null,"imported":false,"approved":false,"imageSearch":[]}]', '', 'MANAGED POSTS',
      ...posts.map((post) => `POST\nid: ${post.id}\nreference: tg-post:${post.id}\ntitle: ${post.title}\nstatus: ${post.status}\nimages:\n${post.imageUrls.length ? post.imageUrls.map((url) => `- ${url}`).join('\n') : '[]'}\ntext:\n${post.text || ''}`),
    ].join('\n\n');
    return { buffer: Buffer.from(`${content}\n`, 'utf8'), filename: `telegram-gpt-context-${channel.id}.txt` };
  }
}
