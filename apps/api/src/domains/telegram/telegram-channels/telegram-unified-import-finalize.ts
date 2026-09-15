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
  const importedPostRefs = new Set(
    (manifest.posts ?? []).filter((row) => row.imported).map((row) => row.ref),
  );
  progress.phase('schedule', 'started');
  for (const row of manifest.schedule ?? []) {
    const ref = row.postRef ?? row.postId ?? 'schedule';
    try {
      if (row.action === 'UNSCHEDULE') {
        await publication.returnManagedPostToDraft(
          userId,
          channelId,
          row.postId!,
        );
        results.schedule.unscheduled++;
        reportUnifiedImportOperation(
          progress,
          'schedule',
          'UNSCHEDULE',
          ref,
          ref,
          'success',
        );
        continue;
      }
      if (row.postRef && importedPostRefs.has(row.postRef)) {
        reportUnifiedImportOperation(
          progress,
          'schedule',
          'SCHEDULE',
          ref,
          ref,
          'skipped',
        );
        continue;
      }
      const postId = row.postId ?? refs.get(row.postRef!);
      if (!postId) throw new Error('Post operation did not produce an id');
      await publication.scheduleManagedPost(userId, channelId, postId, {
        scheduledAt: row.scheduledAt!,
        publicationSlotId: row.slotId!,
      });
      results.schedule.scheduled++;
      reportUnifiedImportOperation(
        progress,
        'schedule',
        'SCHEDULE',
        ref,
        ref,
        'success',
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Schedule operation failed';
      results.schedule.failed.push({ ref, error: message });
      reportUnifiedImportOperation(
        progress,
        'schedule',
        row.action ?? 'SCHEDULE',
        ref,
        ref,
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
    id: string,
    action: () => Promise<unknown>,
  ) => {
    const ref = `delete:${entity}:${id}`;
    try {
      await action();
      results[section].deleted++;
      reportUnifiedImportOperation(
        progress,
        'deletions',
        'DELETE',
        ref,
        `${entity} ${id}`,
        'success',
      );
    } catch (error) {
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
    await remove('posts', 'post', row.id, () =>
      moves.deleteManagedPost(userId, channelId, row.id),
    );
  for (const row of manifest.delete?.hypotheses ?? [])
    await remove('hypotheses', 'hypothesis', row.id, () =>
      hypotheses.remove(userId, channelId, row.id),
    );
  for (const row of manifest.delete?.groups ?? [])
    await remove('groups', 'group', row.id, () =>
      groups.deletePostGroup(userId, row.id),
    );
  progress.phase('deletions', 'completed');
}
