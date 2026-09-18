import type {
  TelegramUnifiedImportManifest,
  TelegramUnifiedImportSectionResult,
} from '@telegram-system/shared';
import { TelegramContentHypothesesService } from './telegram-content-hypotheses.service';
import { TelegramManagedPostMoveService } from './telegram-managed-post-move.service';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import {
  reportUnifiedImportOperation,
  TelegramUnifiedImportProgressReporter,
} from './telegram-unified-import-progress';

type Results = Record<
  'groups' | 'hypotheses' | 'posts' | 'schedule',
  TelegramUnifiedImportSectionResult
>;

export function skipImportedEntity(
  row: {
    imported?: boolean;
    id?: string;
    ref: string;
    action: 'CREATE' | 'UPDATE' | 'ARCHIVE' | 'DELETE';
  },
  section: 'groups' | 'hypotheses' | 'posts',
  label: string,
  refs: Map<string, string>,
  progress: TelegramUnifiedImportProgressReporter,
) {
  if (!row.imported) return false;
  if (row.id) refs.set(row.ref, row.id);
  reportUnifiedImportOperation(
    progress,
    section,
    row.action,
    row.ref,
    label,
    'skipped',
  );
  return true;
}

export async function applyUnifiedImportSchedule(input: {
  userId: string;
  channelId: string;
  manifest: TelegramUnifiedImportManifest;
  refs: Map<string, string>;
  results: Results;
  progress: TelegramUnifiedImportProgressReporter;
  publication: TelegramManagedPostPublicationService;
}) {
  const { userId, channelId, manifest, refs, results, progress, publication } =
    input;
  const postTitles = new Map(
    (manifest.posts ?? []).map((post) => [post.ref, post.title ?? post.ref]),
  );
  progress.phase('schedule', 'started');
  for (const row of manifest.schedule ?? []) {
    const ref = row.postRef ?? row.postId ?? 'schedule';
    const label = `${row.postRef ? (postTitles.get(row.postRef) ?? row.postRef) : row.postId} · ${row.scheduledAt ?? (row.action === 'UNSCHEDULE' ? 'return to drafts' : 'no date')}`;
    if (row.imported) {
      reportUnifiedImportOperation(
        progress,
        'schedule',
        row.action ?? 'SCHEDULE',
        ref,
        label,
        'skipped',
      );
      continue;
    }
    try {
      if (row.action === 'UNSCHEDULE') {
        await publication.returnManagedPostToDraft(
          userId,
          channelId,
          row.postId!,
        );
        results.schedule.unscheduled++;
        row.imported = true;
        reportUnifiedImportOperation(
          progress,
          'schedule',
          'UNSCHEDULE',
          ref,
          label,
          'success',
        );
        continue;
      }
      const postId = row.postId ?? refs.get(row.postRef!);
      if (!postId) throw new Error('Post operation did not produce an id');
      await publication.scheduleManagedPost(userId, channelId, postId, {
        scheduledAt: row.scheduledAt!,
        publicationSlotId: row.slotId?.trim() || undefined,
      });
      results.schedule.scheduled++;
      row.postId = postId;
      row.imported = true;
      reportUnifiedImportOperation(
        progress,
        'schedule',
        'SCHEDULE',
        ref,
        label,
        'success',
      );
    } catch (error) {
      row.imported = false;
      const message =
        error instanceof Error ? error.message : 'Schedule operation failed';
      results.schedule.failed.push({ ref, error: message });
      reportUnifiedImportOperation(
        progress,
        'schedule',
        row.action ?? 'SCHEDULE',
        ref,
        label,
        'failed',
        message,
      );
    }
  }
  progress.phase('schedule', 'completed');
}

export async function applyUnifiedImportRootDeletes(input: {
  userId: string;
  channelId: string;
  manifest: TelegramUnifiedImportManifest;
  results: Results;
  progress: TelegramUnifiedImportProgressReporter;
  moves: TelegramManagedPostMoveService;
  hypotheses: TelegramContentHypothesesService;
  groups: TelegramPostGroupsService;
}) {
  const {
    userId,
    channelId,
    manifest,
    results,
    progress,
    moves,
    hypotheses,
    groups,
  } = input;
  progress.phase('deletions', 'started');
  const remove = async (
    section: 'posts' | 'hypotheses' | 'groups',
    entity: 'post' | 'hypothesis' | 'group',
    target: { id: string; imported?: boolean },
    action: () => Promise<unknown>,
  ) => {
    const { id } = target;
    const ref = `delete:${entity}:${id}`;
    if (target.imported) {
      reportUnifiedImportOperation(
        progress,
        'deletions',
        'DELETE',
        ref,
        `${entity} ${id}`,
        'skipped',
      );
      return;
    }
    try {
      await action();
      results[section].deleted++;
      target.imported = true;
      reportUnifiedImportOperation(
        progress,
        'deletions',
        'DELETE',
        ref,
        `${entity} ${id}`,
        'success',
      );
    } catch (error) {
      target.imported = false;
      const message =
        error instanceof Error ? error.message : `${entity} delete failed`;
      results[section].failed.push({ ref, error: message });
      reportUnifiedImportOperation(
        progress,
        'deletions',
        'DELETE',
        ref,
        `${entity} ${id}`,
        'failed',
        message,
      );
    }
  };
  for (const row of manifest.delete?.posts ?? [])
    await remove('posts', 'post', row, () =>
      moves.deleteManagedPost(userId, channelId, row.id),
    );
  for (const row of manifest.delete?.hypotheses ?? [])
    await remove('hypotheses', 'hypothesis', row, () =>
      hypotheses.remove(userId, channelId, row.id),
    );
  for (const row of manifest.delete?.groups ?? [])
    await remove('groups', 'group', row, () =>
      groups.deletePostGroup(userId, row.id),
    );
  progress.phase('deletions', 'completed');
}
