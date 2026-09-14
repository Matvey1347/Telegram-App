import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import type {
  TelegramUnifiedImportManifest,
  TelegramUnifiedImportPreview,
  TelegramUnifiedImportPreviewItem,
  TelegramUnifiedImportResult,
  TelegramUnifiedImportSectionResult,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import { TelegramManagedPostCommandService } from './telegram-managed-post-command.service';
import { TelegramManagedPostHistoryService } from './telegram-managed-post-history.service';
import { TelegramManagedPostMoveService } from './telegram-managed-post-move.service';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramContentHypothesesService } from './telegram-content-hypotheses.service';

type SectionKey = TelegramUnifiedImportSectionResult['key'];

export function unifiedImportHash(manifest: TelegramUnifiedImportManifest) {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

@Injectable()
export class TelegramUnifiedImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
    private readonly groups: TelegramPostGroupsService,
    private readonly commands: TelegramManagedPostCommandService,
    private readonly history: TelegramManagedPostHistoryService,
    private readonly moves: TelegramManagedPostMoveService,
    private readonly publication: TelegramManagedPostPublicationService,
    private readonly hypotheses: TelegramContentHypothesesService,
  ) {}

  private async context(userId: string, channelId: string) {
    const membership = await this.workspaces.resolveWorkspaceMembershipForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId: membership.workspaceId, isActive: true },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return membership.workspaceId;
  }

  async preview(userId: string, channelId: string, manifest: TelegramUnifiedImportManifest): Promise<TelegramUnifiedImportPreview> {
    const workspaceId = await this.context(userId, channelId);
    if (manifest.version !== 1) throw new BadRequestException('Unsupported unified import version');
    const groupIds = (manifest.groups ?? []).flatMap((row) => row.id ? [row.id] : []);
    const postIds = (manifest.posts ?? []).flatMap((row) => row.id ? [row.id] : []);
    const hypothesisIds = (manifest.hypotheses ?? []).flatMap((row) => row.id ? [row.id] : []);
    const slotIds = (manifest.schedule ?? []).map((row) => row.slotId);
    const [existingGroups, existingPosts, existingHypotheses, existingSlots, scheduleAssignment] = await Promise.all([
      groupIds.length ? this.prisma.postGroup.findMany({ where: { id: { in: groupIds }, workspaceId, telegramChannelId: channelId }, select: { id: true } }) : [],
      postIds.length ? this.prisma.telegramManagedPost.findMany({ where: { id: { in: postIds }, workspaceId, telegramChannelId: channelId }, select: { id: true } }) : [],
      hypothesisIds.length ? this.prisma.telegramContentHypothesis.findMany({ where: { id: { in: hypothesisIds }, workspaceId, telegramChannelId: channelId }, select: { id: true } }) : [],
      slotIds.length ? this.prisma.telegramPublicationScheduleSlot.findMany({ where: { id: { in: slotIds }, schedule: { workspaceId } }, select: { id: true, scheduleId: true } }) : [],
      this.prisma.telegramChannelPublicationScheduleAssignment.findFirst({ where: { workspaceId, channelId }, select: { scheduleId: true, selectionMode: true, selectedSlots: { select: { slotId: true } } } }),
    ]);
    const knownGroups = new Set(existingGroups.map((row) => row.id));
    const knownPosts = new Set(existingPosts.map((row) => row.id));
    const knownHypotheses = new Set(existingHypotheses.map((row) => row.id));
    const typedExistingSlots = existingSlots as Array<{ id: string; scheduleId: string }>;
    const selectedSlotIds = new Set(scheduleAssignment?.selectedSlots?.map((row) => row.slotId) ?? []);
    const knownSlots = new Set(typedExistingSlots
      .filter((row) => row.scheduleId === scheduleAssignment?.scheduleId)
      .filter((row) => scheduleAssignment?.selectionMode === 'FULL' || selectedSlotIds.has(row.id))
      .map((row) => row.id));
    const groupRefs = new Set((manifest.groups ?? []).map((row) => row.ref));
    const hypothesisRefs = new Set((manifest.hypotheses ?? []).map((row) => row.ref));
    const postRefs = new Set((manifest.posts ?? []).map((row) => row.ref));
    const duplicateRefs = new Set<string>();
    const seen = new Set<string>();
    for (const rows of [manifest.groups ?? [], manifest.hypotheses ?? [], manifest.posts ?? []]) {
      rows.forEach((row) => { if (seen.has(row.ref)) duplicateRefs.add(row.ref); seen.add(row.ref); });
    }
    const item = (ref: string, action: string, label: string, errors: string[]): TelegramUnifiedImportPreviewItem => ({ ref, action, label, valid: errors.length === 0, warnings: [], errors });
    const sections = [
      { key: 'groups' as const, items: (manifest.groups ?? []).map((row) => item(row.ref, row.action, row.title ?? row.id ?? row.ref, [
        ...(duplicateRefs.has(row.ref) ? ['Duplicate ref'] : []),
        ...(row.action === 'CREATE' && !row.title?.trim() ? ['title is required for CREATE'] : []),
        ...(row.action !== 'CREATE' && (!row.id || !knownGroups.has(row.id)) ? ['Group does not belong to this channel'] : []),
      ])) },
      { key: 'hypotheses' as const, items: (manifest.hypotheses ?? []).map((row) => item(row.ref, row.action, row.value?.name ?? row.id ?? row.ref, [
        ...(duplicateRefs.has(row.ref) ? ['Duplicate ref'] : []),
        ...(row.action === 'CREATE' && !row.value ? ['value is required for CREATE'] : []),
        ...(row.action === 'UPDATE' && !row.value?.name?.trim() ? ['value.name is required for UPDATE'] : []),
        ...(row.action !== 'CREATE' && !row.id ? ['id is required'] : []),
        ...(row.action !== 'CREATE' && row.id && !knownHypotheses.has(row.id) ? ['Hypothesis does not belong to this channel'] : []),
      ])) },
      { key: 'posts' as const, items: (manifest.posts ?? []).map((row) => item(row.ref, row.action, row.title ?? row.id ?? row.ref, [
        ...(duplicateRefs.has(row.ref) ? ['Duplicate ref'] : []),
        ...(row.action === 'CREATE' && !row.title?.trim() ? ['title is required for CREATE'] : []),
        ...(row.action !== 'CREATE' && (!row.id || !knownPosts.has(row.id)) ? ['Post does not belong to this channel'] : []),
        ...(row.groupRef && !groupRefs.has(row.groupRef) ? ['Unknown groupRef'] : []),
        ...((row.hypothesisRefs ?? []).filter((ref) => !hypothesisRefs.has(ref)).map((ref) => `Unknown hypothesisRef: ${ref}`)),
      ])) },
      { key: 'schedule' as const, items: (manifest.schedule ?? []).map((row) => item(row.postRef, 'SCHEDULE', row.scheduledAt, [
        ...(!postRefs.has(row.postRef) ? ['Unknown postRef'] : []),
        ...(!row.slotId?.trim() ? ['slotId is required'] : []),
        ...(row.slotId?.trim() && !knownSlots.has(row.slotId) ? ['Slot is not assigned to this channel'] : []),
        ...(Number.isNaN(Date.parse(row.scheduledAt)) ? ['scheduledAt must be ISO-8601'] : []),
      ])) },
    ].map((section) => ({ ...section, validCount: section.items.filter((row) => row.valid).length, invalidCount: section.items.filter((row) => !row.valid).length }));
    return { version: 1, manifestHash: unifiedImportHash(manifest), valid: sections.every((section) => section.invalidCount === 0), sections };
  }

  async apply(userId: string, channelId: string, manifest: TelegramUnifiedImportManifest, expectedHash: string): Promise<TelegramUnifiedImportResult> {
    const preview = await this.preview(userId, channelId, manifest);
    if (!expectedHash || expectedHash !== preview.manifestHash) throw new BadRequestException('Manifest changed after preview');
    if (!preview.valid) throw new BadRequestException({ message: 'Unified import has validation errors', preview });
    const refs = new Map<string, string>();
    const result = (key: SectionKey): TelegramUnifiedImportSectionResult => ({ key, created: 0, updated: 0, deleted: 0, scheduled: 0, failed: [] });
    const results = { groups: result('groups'), hypotheses: result('hypotheses'), posts: result('posts'), schedule: result('schedule') };
    for (const row of manifest.groups ?? []) {
      try {
        if (row.action === 'CREATE') { const value = await this.groups.createPostGroup(userId, { telegramChannelId: channelId, title: row.title!, icon: row.icon }); refs.set(row.ref, value.id); results.groups.created++; }
        else if (row.action === 'UPDATE') { await this.groups.updatePostGroup(userId, row.id!, { title: row.title, icon: row.icon }); refs.set(row.ref, row.id!); results.groups.updated++; }
        else { await this.groups.deletePostGroup(userId, row.id!); results.groups.deleted++; }
      } catch (error) { results.groups.failed.push({ ref: row.ref, error: error instanceof Error ? error.message : 'Group operation failed' }); }
    }
    for (const row of manifest.hypotheses ?? []) {
      try {
        if (row.action === 'CREATE') { const value = await this.hypotheses.create(userId, channelId, row.value!); refs.set(row.ref, value.id); results.hypotheses.created++; }
        else {
          const archived = row.action === 'ARCHIVE' && !row.value?.name
            ? await this.prisma.telegramContentHypothesis.findUniqueOrThrow({ where: { id: row.id! }, select: { name: true, description: true, iconId: true, conclusion: true } })
            : null;
          const value = await this.hypotheses.update(userId, channelId, row.id!, { ...archived, ...row.value!, name: row.value?.name ?? archived!.name, status: row.action === 'ARCHIVE' ? 'ARCHIVED' : row.value?.status });
          refs.set(row.ref, value.id); results.hypotheses.updated++;
        }
      } catch (error) { results.hypotheses.failed.push({ ref: row.ref, error: error instanceof Error ? error.message : 'Hypothesis operation failed' }); }
    }
    for (const row of manifest.posts ?? []) {
      try {
        if (row.action === 'CREATE') { const value = await this.commands.createManagedPost(userId, channelId, { title: row.title!, text: row.text ?? undefined, imageUrls: row.imageUrls }, { groupId: row.groupRef ? refs.get(row.groupRef) : null }); refs.set(row.ref, value.id); if (row.hypothesisRefs?.length) await this.hypotheses.setPostHypotheses(userId, channelId, value.id, { hypothesisIds: row.hypothesisRefs.map((ref) => refs.get(ref)!) }); results.posts.created++; }
        else if (row.action === 'UPDATE') { await this.history.updateManagedPost(userId, channelId, row.id!, { title: row.title, text: row.text ?? undefined, imageUrls: row.imageUrls }); refs.set(row.ref, row.id!); if (row.hypothesisRefs) await this.hypotheses.setPostHypotheses(userId, channelId, row.id!, { hypothesisIds: row.hypothesisRefs.map((ref) => refs.get(ref)!) }); results.posts.updated++; }
        else { await this.moves.deleteManagedPost(userId, channelId, row.id!); results.posts.deleted++; }
      } catch (error) { results.posts.failed.push({ ref: row.ref, error: error instanceof Error ? error.message : 'Post operation failed' }); }
    }
    for (const row of manifest.schedule ?? []) {
      try { const postId = refs.get(row.postRef); if (!postId) throw new Error('Post operation did not produce an id'); await this.publication.scheduleManagedPost(userId, channelId, postId, { scheduledAt: row.scheduledAt, publicationSlotId: row.slotId }); results.schedule.scheduled++; }
      catch (error) { results.schedule.failed.push({ ref: row.postRef, error: error instanceof Error ? error.message : 'Schedule operation failed' }); }
    }
    return { manifestHash: preview.manifestHash, sections: [results.groups, results.hypotheses, results.posts, results.schedule] };
  }
}
