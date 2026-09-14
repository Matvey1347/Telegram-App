import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TelegramContentHypothesisStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { TelegramContentHypothesisInputDto, TelegramManagedPostHypothesesInputDto } from './telegram-content-hypotheses.dto';

const hypothesisInclude = { icon: true, posts: { select: { managedPost: { select: { id: true, status: true, telegramMessageIds: true, publishedAt: true } } } } };

@Injectable()
export class TelegramContentHypothesesService {
  constructor(private readonly prisma: PrismaService, private readonly workspace: WorkspaceService) {}
  private async scope(userId: string, channelId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({ where: { id: channelId, workspaceId }, select: { id: true } });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return workspaceId;
  }
  private async validateIcon(workspaceId: string, iconId?: string | null) {
    if (!iconId) return;
    const icon = await this.prisma.icon.findFirst({ where: { id: iconId, OR: [{ workspaceId }, { workspaceId: null }] }, select: { id: true } });
    if (!icon) throw new BadRequestException('Icon is unavailable in this workspace');
  }
  private lifecycle(status: TelegramContentHypothesisStatus, existing?: { startedAt: Date | null; completedAt: Date | null }) {
    const terminal = status === 'SUCCESSFUL' || status === 'FAILED' || status === 'ARCHIVED';
    return {
      startedAt: status === 'ACTIVE' ? (existing?.startedAt ?? new Date()) : existing?.startedAt,
      completedAt: terminal ? (existing?.completedAt ?? new Date()) : null,
    };
  }
  async list(userId: string, channelId: string) {
    const workspaceId = await this.scope(userId, channelId);
    const rows = await this.prisma.telegramContentHypothesis.findMany({ where: { workspaceId, telegramChannelId: channelId }, include: hypothesisInclude, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] });
    const messageIds = [...new Set(rows.flatMap((h) => h.posts.flatMap((p) => p.managedPost.telegramMessageIds)))];
    const posts = messageIds.length ? await this.prisma.telegramPost.findMany({ where: { workspaceId, telegramChannelId: channelId, telegramMessageId: { in: messageIds }, excludeFromAnalytics: false }, select: { telegramMessageId: true, viewsCount: true, reactionsCount: true, commentsCount: true, forwardsCount: true } }) : [];
    const metricsByMessage = new Map(posts.map((p) => [p.telegramMessageId, p]));
    const snapshotDates = rows.flatMap((h) => [h.startedAt, h.completedAt]).filter(Boolean) as Date[];
    const snapshots = snapshotDates.length ? await this.prisma.telegramChannelAudienceSnapshot.findMany({ where: { workspaceId, telegramChannelId: channelId, collectedAt: { gte: new Date(Math.min(...snapshotDates.map(Number)) - 86400000), lte: new Date(Math.max(Date.now(), ...snapshotDates.map(Number)) + 86400000) } }, select: { collectedAt: true, subscribersCount: true }, orderBy: { collectedAt: 'asc' }, take: 5000 }) : [];
    return rows.map((row) => this.map(row, metricsByMessage, snapshots));
  }
  private map(row: any, metricsByMessage = new Map<string, any>(), snapshots: Array<{ collectedAt: Date; subscribersCount: number | null }> = []) {
    const managed = row.posts.map((p: any) => p.managedPost);
    const published = managed.filter((p: any) => p.publishedAt || p.status === 'PUBLISHED');
    const metrics = published.flatMap((p: any) => p.telegramMessageIds.map((id: string) => metricsByMessage.get(id)).filter(Boolean));
    const avg = (fn: (p: any) => number | null) => { const values = metrics.map(fn).filter((v): v is number => v !== null && Number.isFinite(v)); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; };
    const closest = (date: Date | null, side: 'before' | 'after') => !date ? null : (side === 'before' ? [...snapshots].reverse().find((s) => s.collectedAt <= date) : snapshots.find((s) => s.collectedAt >= date))?.subscribersCount ?? null;
    const start = closest(row.startedAt, 'after'), end = closest(row.completedAt ?? new Date(), 'before');
    return { id: row.id, telegramChannelId: row.telegramChannelId, name: row.name, description: row.description, status: row.status, iconPresentation: iconToResolvedEmoji(row.icon), startedAt: row.startedAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null, conclusion: row.conclusion, metrics: { linkedPosts: managed.length, publishedPosts: published.length, averageViews: avg((p) => p.viewsCount), averageReactionRate: avg((p) => p.viewsCount ? ((p.reactionsCount ?? 0) / p.viewsCount) * 100 : null), averageCommentRate: avg((p) => p.viewsCount ? ((p.commentsCount ?? 0) / p.viewsCount) * 100 : null), averageForwardRate: avg((p) => p.viewsCount ? ((p.forwardsCount ?? 0) / p.viewsCount) * 100 : null), observedSubscriberDelta: start !== null && end !== null ? end - start : null }, postIds: managed.map((p: any) => p.id), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }
  async create(userId: string, channelId: string, dto: TelegramContentHypothesisInputDto) {
    const workspaceId = await this.scope(userId, channelId); await this.validateIcon(workspaceId, dto.iconId);
    const status = dto.status ?? 'DRAFT';
    const row = await this.prisma.telegramContentHypothesis.create({ data: { workspaceId, telegramChannelId: channelId, name: dto.name.trim(), description: dto.description?.trim() || null, status, iconId: dto.iconId ?? null, conclusion: dto.conclusion?.trim() || null, ...this.lifecycle(status) }, include: hypothesisInclude });
    return this.map(row);
  }
  async update(userId: string, channelId: string, id: string, dto: TelegramContentHypothesisInputDto) {
    const workspaceId = await this.scope(userId, channelId); await this.validateIcon(workspaceId, dto.iconId);
    const existing = await this.prisma.telegramContentHypothesis.findFirst({ where: { id, workspaceId, telegramChannelId: channelId }, select: { id: true, status: true, startedAt: true, completedAt: true } });
    if (!existing) throw new NotFoundException('Content hypothesis not found');
    const status = dto.status ?? existing.status;
    const row = await this.prisma.telegramContentHypothesis.update({ where: { id }, data: { name: dto.name.trim(), description: dto.description?.trim() || null, status, iconId: dto.iconId ?? null, conclusion: dto.conclusion?.trim() || null, ...this.lifecycle(status, existing) }, include: hypothesisInclude });
    return this.map(row);
  }
  async remove(userId: string, channelId: string, id: string) {
    const workspaceId = await this.scope(userId, channelId);
    const result = await this.prisma.telegramContentHypothesis.deleteMany({ where: { id, workspaceId, telegramChannelId: channelId } });
    if (!result.count) throw new NotFoundException('Content hypothesis not found');
    return { success: true };
  }
  async setPostHypotheses(userId: string, channelId: string, postId: string, dto: TelegramManagedPostHypothesesInputDto) {
    const workspaceId = await this.scope(userId, channelId);
    const post = await this.prisma.telegramManagedPost.findFirst({ where: { id: postId, workspaceId, telegramChannelId: channelId }, select: { id: true } });
    if (!post) throw new NotFoundException('Managed post not found');
    const ids = [...new Set(dto.hypothesisIds)];
    const count = await this.prisma.telegramContentHypothesis.count({ where: { id: { in: ids }, workspaceId, telegramChannelId: channelId } });
    if (count !== ids.length) throw new BadRequestException('One or more hypotheses do not belong to this channel');
    await this.prisma.$transaction(async (tx) => { await tx.telegramManagedPostContentHypothesis.deleteMany({ where: { managedPostId: postId } }); if (ids.length) await tx.telegramManagedPostContentHypothesis.createMany({ data: ids.map((hypothesisId) => ({ managedPostId: postId, hypothesisId })) }); });
    return { postId, hypothesisIds: ids };
  }
}
