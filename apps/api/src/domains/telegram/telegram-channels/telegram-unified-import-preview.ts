import type {
  ResolvedEmoji,
  TelegramUnifiedImportManifest,
  TelegramUnifiedImportPreview,
  TelegramUnifiedImportPreviewItem,
} from '@telegram-system/shared';

type PreviewScope = {
  existingGroups: Array<{
    id: string;
    title?: string;
    description?: string | null;
    icon?: string | null;
  }>;
  existingPosts: Array<{
    id: string;
    title?: string;
    text?: string | null;
    imageUrls?: string[];
    icon?: string | null;
    status?: string;
    scheduledAt?: Date | string | null;
    publicationSlot?: {
      id: string;
      kind: 'CONTENT' | 'AD';
      title: string;
    } | null;
  }>;
  existingHypotheses: Array<{
    id: string;
    name?: string;
    description?: string | null;
    status?: TelegramUnifiedImportPreviewItem['status'];
    conclusion?: string | null;
    icon?: { emoji?: string | null } | null;
  }>;
  existingSlots: Array<{
    id: string;
    scheduleId: string;
    kind: 'CONTENT' | 'AD';
    title: string;
  }>;
  scheduleAssignment: {
    scheduleId: string;
    selectionMode: string;
    selectedSlots: Array<{ slotId: string }>;
  } | null;
  iconPresentationsById?: Map<string, ResolvedEmoji>;
};

const duplicateValues = (values: string[]) => {
  const duplicates = new Set<string>();
  const seen = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return duplicates;
};

const isHttpUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const displayValue = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.length ? value.join('\n') : null;
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint')
    return value.toString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return null;
};

const changesFor = (
  fields: Array<{ field: string; before: unknown; after: unknown }>,
) =>
  fields.flatMap(({ field, before, after }) => {
    if (after === undefined) return [];
    const previous = displayValue(before);
    const next = displayValue(after);
    return previous === next ? [] : [{ field, before: previous, after: next }];
  });

const previewItem = (
  ref: string,
  action: string,
  label: string,
  errors: string[],
  status?: TelegramUnifiedImportPreviewItem['status'],
  imported?: boolean,
  approved?: boolean,
  presentation?: Pick<
    TelegramUnifiedImportPreviewItem,
    | 'entityId'
    | 'icon'
    | 'iconPresentation'
    | 'description'
    | 'text'
    | 'imageUrls'
    | 'scheduledAt'
    | 'slotId'
    | 'slotKind'
    | 'slotTitle'
    | 'changes'
  >,
): TelegramUnifiedImportPreviewItem => ({
  ref,
  action,
  label,
  valid: errors.length === 0,
  warnings: [],
  errors,
  status,
  imported,
  approved,
  ...presentation,
});

export function buildUnifiedImportPreviewSections(
  manifest: TelegramUnifiedImportManifest,
  scope: PreviewScope,
): TelegramUnifiedImportPreview['sections'] {
  const postIconPresentation = (value?: string | null) => {
    if (!value) return null;
    if (/\p{Extended_Pictographic}/u.test(value))
      return { type: 'unicode' as const, value, name: value };
    return scope.iconPresentationsById?.get(value) ?? null;
  };
  const deleteGroups = manifest.delete?.groups ?? [];
  const deleteHypotheses = manifest.delete?.hypotheses ?? [];
  const deletePosts = manifest.delete?.posts ?? [];
  const knownGroups = new Set(scope.existingGroups.map((row) => row.id));
  const knownPosts = new Set(scope.existingPosts.map((row) => row.id));
  const knownHypotheses = new Set(
    scope.existingHypotheses.map((row) => row.id),
  );
  const groupsById = new Map(scope.existingGroups.map((row) => [row.id, row]));
  const postsById = new Map(scope.existingPosts.map((row) => [row.id, row]));
  const hypothesesById = new Map(
    scope.existingHypotheses.map((row) => [row.id, row]),
  );
  const selectedSlotIds = new Set(
    scope.scheduleAssignment?.selectedSlots.map((row) => row.slotId) ?? [],
  );
  const knownSlots = new Set(
    scope.existingSlots
      .filter((row) => row.scheduleId === scope.scheduleAssignment?.scheduleId)
      .filter(
        (row) =>
          scope.scheduleAssignment?.selectionMode === 'FULL' ||
          selectedSlotIds.has(row.id),
      )
      .map((row) => row.id),
  );
  const slotsById = new Map(scope.existingSlots.map((row) => [row.id, row]));
  const groupRefs = new Set(
    (manifest.groups ?? [])
      .filter((row) => row.action !== 'DELETE')
      .map((row) => row.ref),
  );
  const hypothesisRefs = new Set(
    (manifest.hypotheses ?? [])
      .filter((row) => row.action !== 'DELETE')
      .map((row) => row.ref),
  );
  const postRefs = new Set(
    (manifest.posts ?? [])
      .filter((row) => row.action !== 'DELETE')
      .map((row) => row.ref),
  );
  const manifestPostsByRef = new Map(
    (manifest.posts ?? []).map((row) => [row.ref, row]),
  );
  const schedulePostRefs = (manifest.schedule ?? []).flatMap((row) =>
    row.action === 'UNSCHEDULE' || !row.postRef ? [] : [row.postRef],
  );
  const schedulePostIds = (manifest.schedule ?? []).flatMap((row) =>
    row.action !== 'UNSCHEDULE' && row.postId ? [row.postId] : [],
  );
  const unschedulePostIds = (manifest.schedule ?? []).flatMap((row) =>
    row.action === 'UNSCHEDULE' && row.postId ? [row.postId] : [],
  );
  const duplicateSchedulePostRefs = duplicateValues(schedulePostRefs);
  const duplicateSchedulePostIds = duplicateValues(schedulePostIds);
  const duplicateUnschedulePostIds = duplicateValues(unschedulePostIds);
  const scheduledExistingPostIds = new Set(
    schedulePostRefs.flatMap((ref) => {
      const postId = manifestPostsByRef.get(ref)?.id;
      return postId ? [postId] : [];
    }),
  );
  const duplicateRefs = duplicateValues([
    ...(manifest.groups ?? []).map((row) => row.ref),
    ...(manifest.hypotheses ?? []).map((row) => row.ref),
    ...(manifest.posts ?? []).map((row) => row.ref),
  ]);
  const groupDeleteIds = new Set(deleteGroups.map((row) => row.id));
  const hypothesisDeleteIds = new Set(deleteHypotheses.map((row) => row.id));
  const postDeleteIds = new Set(deletePosts.map((row) => row.id));
  const duplicateGroupDeleteIds = duplicateValues(
    deleteGroups.map((row) => row.id),
  );
  const duplicateHypothesisDeleteIds = duplicateValues(
    deleteHypotheses.map((row) => row.id),
  );
  const duplicatePostDeleteIds = duplicateValues(
    deletePosts.map((row) => row.id),
  );
  const groupOperationIds = new Set(
    (manifest.groups ?? []).flatMap((row) => (row.id ? [row.id] : [])),
  );
  const hypothesisOperationIds = new Set(
    (manifest.hypotheses ?? []).flatMap((row) => (row.id ? [row.id] : [])),
  );
  const postOperationIds = new Set(
    (manifest.posts ?? []).flatMap((row) => (row.id ? [row.id] : [])),
  );

  const sections: TelegramUnifiedImportPreview['sections'] = [
    {
      key: 'groups',
      items: [
        ...(manifest.groups ?? []).map((row) => {
          const existing = row.id ? groupsById.get(row.id) : undefined;
          return previewItem(
            row.ref,
            row.action,
            row.title ?? existing?.title ?? row.id ?? row.ref,
            row.imported
              ? []
              : [
                  ...(duplicateRefs.has(row.ref) ? ['Duplicate ref'] : []),
                  ...(row.action === 'CREATE' && !row.title?.trim()
                    ? ['title is required for CREATE']
                    : []),
                  ...(row.action !== 'CREATE' &&
                  (!row.id || !knownGroups.has(row.id))
                    ? ['Group does not belong to this channel']
                    : []),
                  ...(row.id && groupDeleteIds.has(row.id)
                    ? ['Group also appears in delete.groups']
                    : []),
                ],
            undefined,
            row.imported,
            undefined,
            row.action === 'DELETE'
              ? {
                  entityId: row.id,
                  icon: existing?.icon,
                  description: existing?.description,
                }
              : row.action === 'UPDATE'
                ? {
                    entityId: row.id,
                    changes: changesFor([
                      {
                        field: 'icon',
                        before: existing?.icon,
                        after: row.icon,
                      },
                      {
                        field: 'title',
                        before: existing?.title,
                        after: row.title,
                      },
                    ]),
                  }
                : undefined,
          );
        }),
        ...deleteGroups.map((row) => {
          const existing = groupsById.get(row.id);
          return previewItem(
            `delete:group:${row.id}`,
            'DELETE',
            existing?.title ?? row.id,
            row.imported
              ? []
              : [
                  ...(!row.id?.trim() ? ['id is required'] : []),
                  ...(row.id?.trim() && !knownGroups.has(row.id)
                    ? ['Group does not belong to this channel']
                    : []),
                  ...(duplicateGroupDeleteIds.has(row.id)
                    ? ['Duplicate delete id']
                    : []),
                  ...(groupOperationIds.has(row.id)
                    ? ['Group also appears in groups operations']
                    : []),
                ],
            undefined,
            row.imported,
            undefined,
            {
              entityId: row.id,
              icon: existing?.icon,
              description: existing?.description,
            },
          );
        }),
      ],
      validCount: 0,
      invalidCount: 0,
    },
    {
      key: 'hypotheses',
      items: [
        ...(manifest.hypotheses ?? []).map((row) => {
          const existing = row.id ? hypothesesById.get(row.id) : undefined;
          return previewItem(
            row.ref,
            row.action,
            row.value?.name ?? existing?.name ?? row.id ?? row.ref,
            row.imported
              ? []
              : [
                  ...(duplicateRefs.has(row.ref) ? ['Duplicate ref'] : []),
                  ...(row.action === 'CREATE' && !row.value
                    ? ['value is required for CREATE']
                    : []),
                  ...(row.action === 'UPDATE' && !row.value?.name?.trim()
                    ? ['value.name is required for UPDATE']
                    : []),
                  ...(row.action !== 'CREATE' && !row.id
                    ? ['id is required']
                    : []),
                  ...(row.action !== 'CREATE' &&
                  row.id &&
                  !knownHypotheses.has(row.id)
                    ? ['Hypothesis does not belong to this channel']
                    : []),
                  ...(row.id && hypothesisDeleteIds.has(row.id)
                    ? ['Hypothesis also appears in delete.hypotheses']
                    : []),
                ],
            row.value?.status ?? existing?.status,
            row.imported,
            undefined,
            row.action === 'DELETE'
              ? {
                  entityId: row.id,
                  icon: existing?.icon?.emoji,
                  description: existing?.description ?? existing?.conclusion,
                }
              : row.action === 'UPDATE' || row.action === 'ARCHIVE'
                ? {
                    entityId: row.id,
                    changes: changesFor([
                      {
                        field: 'icon',
                        before: existing?.icon?.emoji,
                        after: row.icon,
                      },
                      {
                        field: 'name',
                        before: existing?.name,
                        after: row.value?.name,
                      },
                      {
                        field: 'description',
                        before: existing?.description,
                        after: row.value?.description,
                      },
                      {
                        field: 'status',
                        before: existing?.status,
                        after:
                          row.action === 'ARCHIVE'
                            ? 'ARCHIVED'
                            : row.value?.status,
                      },
                      {
                        field: 'conclusion',
                        before: existing?.conclusion,
                        after: row.value?.conclusion,
                      },
                    ]),
                  }
                : undefined,
          );
        }),
        ...deleteHypotheses.map((row) => {
          const existing = hypothesesById.get(row.id);
          return previewItem(
            `delete:hypothesis:${row.id}`,
            'DELETE',
            existing?.name ?? row.id,
            row.imported
              ? []
              : [
                  ...(!row.id?.trim() ? ['id is required'] : []),
                  ...(row.id?.trim() && !knownHypotheses.has(row.id)
                    ? ['Hypothesis does not belong to this channel']
                    : []),
                  ...(duplicateHypothesisDeleteIds.has(row.id)
                    ? ['Duplicate delete id']
                    : []),
                  ...(hypothesisOperationIds.has(row.id)
                    ? ['Hypothesis also appears in hypotheses operations']
                    : []),
                ],
            existing?.status,
            row.imported,
            undefined,
            {
              entityId: row.id,
              icon: existing?.icon?.emoji,
              description: existing?.description ?? existing?.conclusion,
            },
          );
        }),
      ],
      validCount: 0,
      invalidCount: 0,
    },
    {
      key: 'posts',
      items: [
        ...(manifest.posts ?? []).map((row) => {
          const existing = row.id ? postsById.get(row.id) : undefined;
          return previewItem(
            row.ref,
            row.action,
            row.title ?? existing?.title ?? row.id ?? row.ref,
            row.imported
              ? []
              : [
                  ...(duplicateRefs.has(row.ref) ? ['Duplicate ref'] : []),
                  ...(row.action === 'CREATE' && !row.title?.trim()
                    ? ['title is required for CREATE']
                    : []),
                  ...(row.action !== 'CREATE' &&
                  (!row.id || !knownPosts.has(row.id))
                    ? ['Post does not belong to this channel']
                    : []),
                  ...(row.groupRef && !groupRefs.has(row.groupRef)
                    ? ['Unknown groupRef']
                    : []),
                  ...(row.hypothesisRefs ?? [])
                    .filter((ref) => !hypothesisRefs.has(ref))
                    .map((ref) => `Unknown hypothesisRef: ${ref}`),
                  ...(row.imageUrls ?? []).flatMap((url, index) =>
                    isHttpUrl(url)
                      ? []
                      : [
                          `imageUrls.${index} must use a valid HTTP or HTTPS URL`,
                        ],
                  ),
                  ...(row.id && postDeleteIds.has(row.id)
                    ? ['Post also appears in delete.posts']
                    : []),
                ],
            undefined,
            row.imported,
            row.approved,
            row.action === 'DELETE'
              ? {
                  entityId: row.id,
                  iconPresentation: postIconPresentation(existing?.icon),
                  text: existing?.text,
                  imageUrls: existing?.imageUrls,
                }
              : row.action === 'UPDATE'
                ? {
                    entityId: row.id,
                    iconPresentation: postIconPresentation(
                      row.icon ?? existing?.icon,
                    ),
                    changes: changesFor([
                      {
                        field: 'icon',
                        before: existing?.icon,
                        after: row.icon,
                      },
                      {
                        field: 'title',
                        before: existing?.title,
                        after: row.title,
                      },
                      {
                        field: 'text',
                        before: existing?.text,
                        after: row.text ?? undefined,
                      },
                      {
                        field: 'imageUrls',
                        before: existing?.imageUrls,
                        after: row.imageUrls,
                      },
                    ]),
                  }
                : {
                    iconPresentation: postIconPresentation(row.icon),
                  },
          );
        }),
        ...deletePosts.map((row) => {
          const existing = postsById.get(row.id);
          return previewItem(
            `delete:post:${row.id}`,
            'DELETE',
            existing?.title ?? row.id,
            row.imported
              ? []
              : [
                  ...(!row.id?.trim() ? ['id is required'] : []),
                  ...(row.id?.trim() && !knownPosts.has(row.id)
                    ? ['Post does not belong to this channel']
                    : []),
                  ...(duplicatePostDeleteIds.has(row.id)
                    ? ['Duplicate delete id']
                    : []),
                  ...(postOperationIds.has(row.id)
                    ? ['Post also appears in posts operations']
                    : []),
                  ...(unschedulePostIds.includes(row.id)
                    ? ['Post also appears in UNSCHEDULE operations']
                    : []),
                ],
            undefined,
            row.imported,
            undefined,
            {
              entityId: row.id,
              iconPresentation: postIconPresentation(existing?.icon),
              text: existing?.text,
              imageUrls: existing?.imageUrls,
            },
          );
        }),
      ],
      validCount: 0,
      invalidCount: 0,
    },
    {
      key: 'schedule',
      items: (manifest.schedule ?? []).map((row) => {
        if (row.action === 'UNSCHEDULE') {
          const existing = row.postId ? postsById.get(row.postId) : undefined;
          return previewItem(
            row.postId ?? 'unschedule',
            'UNSCHEDULE',
            existing?.title ?? row.postId ?? 'Unscheduled publication',
            row.imported
              ? []
              : [
                  ...(!row.postId?.trim() ? ['postId is required'] : []),
                  ...(row.postId?.trim() && !knownPosts.has(row.postId)
                    ? ['Post does not belong to this channel']
                    : []),
                  ...(existing && existing.status !== 'SCHEDULED'
                    ? ['Only a scheduled post can be unscheduled']
                    : []),
                  ...(row.postId && duplicateUnschedulePostIds.has(row.postId)
                    ? ['Post is unscheduled more than once']
                    : []),
                  ...(row.postId && postDeleteIds.has(row.postId)
                    ? ['Post also appears in delete.posts']
                    : []),
                  ...(row.postId && scheduledExistingPostIds.has(row.postId)
                    ? ['Post also appears in SCHEDULE operations']
                    : []),
                  ...(row.postId && schedulePostIds.includes(row.postId)
                    ? ['Post also appears in SCHEDULE operations']
                    : []),
                ],
            undefined,
            row.imported,
            undefined,
            {
              entityId: row.postId,
              iconPresentation: postIconPresentation(existing?.icon),
              text: existing?.text,
              imageUrls: existing?.imageUrls,
              scheduledAt: existing?.scheduledAt
                ? new Date(existing.scheduledAt).toISOString()
                : (row.scheduledAt ?? null),
              slotId: existing?.publicationSlot?.id ?? row.slotId ?? null,
              slotKind:
                existing?.publicationSlot?.kind ??
                row.slotKind ??
                (row.slotId ? slotsById.get(row.slotId)?.kind : undefined) ??
                null,
              slotTitle:
                existing?.publicationSlot?.title ??
                (row.slotId ? slotsById.get(row.slotId)?.title : undefined) ??
                null,
            },
          );
        }
        const postRef = row.postRef ?? '';
        const post = manifestPostsByRef.get(postRef);
        const existing = row.postId ? postsById.get(row.postId) : undefined;
        return previewItem(
          postRef || row.postId || 'schedule',
          'SCHEDULE',
          post?.title ?? existing?.title ?? row.scheduledAt ?? postRef,
          row.imported
            ? []
            : [
                ...(!postRef && !row.postId
                  ? ['postRef or postId is required']
                  : []),
                ...(postRef && row.postId
                  ? ['Use either postRef or postId, not both']
                  : []),
                ...(postRef && !postRefs.has(postRef)
                  ? ['Unknown postRef']
                  : []),
                ...(duplicateSchedulePostRefs.has(postRef)
                  ? ['Post is scheduled more than once']
                  : []),
                ...(row.postId && !knownPosts.has(row.postId)
                  ? ['Post does not belong to this channel']
                  : []),
                ...(row.postId && duplicateSchedulePostIds.has(row.postId)
                  ? ['Post is scheduled more than once']
                  : []),
                ...(post?.id && schedulePostIds.includes(post.id)
                  ? ['Post is scheduled more than once']
                  : []),
                ...(row.postId && scheduledExistingPostIds.has(row.postId)
                  ? ['Post is scheduled more than once']
                  : []),
                ...(post?.id && unschedulePostIds.includes(post.id)
                  ? ['Post also appears in UNSCHEDULE operations']
                  : []),
                ...(row.postId && unschedulePostIds.includes(row.postId)
                  ? ['Post also appears in UNSCHEDULE operations']
                  : []),
                ...(row.postId && postDeleteIds.has(row.postId)
                  ? ['Post also appears in delete.posts']
                  : []),
                ...(row.slotId?.trim() && !knownSlots.has(row.slotId)
                  ? ['Slot is not assigned to this channel']
                  : []),
                ...(!row.scheduledAt ||
                Number.isNaN(Date.parse(row.scheduledAt))
                  ? ['scheduledAt must be ISO-8601']
                  : []),
              ],
          undefined,
          row.imported,
          undefined,
          {
            entityId: post?.id ?? existing?.id,
            iconPresentation: postIconPresentation(
              post?.icon ?? existing?.icon,
            ),
            text: post?.text ?? existing?.text,
            imageUrls: post?.imageUrls ?? existing?.imageUrls,
            scheduledAt: row.scheduledAt ?? null,
            slotId: row.slotId ?? null,
            slotKind:
              row.slotKind ??
              (row.slotId ? slotsById.get(row.slotId)?.kind : undefined) ??
              null,
            slotTitle:
              (row.slotId ? slotsById.get(row.slotId)?.title : undefined) ??
              null,
          },
        );
      }),
      validCount: 0,
      invalidCount: 0,
    },
  ];

  return sections.map((section) => {
    const items =
      section.key === 'groups' || section.key === 'hypotheses'
        ? section.items.filter(
            (item) =>
              !(
                item.action === 'UPDATE' &&
                item.valid &&
                item.changes?.length === 0
              ),
          )
        : section.items;
    return {
      ...section,
      items,
      validCount: items.filter((row) => row.valid).length,
      invalidCount: items.filter((row) => !row.valid).length,
    };
  });
}
