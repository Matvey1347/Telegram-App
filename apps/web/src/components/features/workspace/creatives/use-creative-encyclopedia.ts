import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type {
  CreateWorkspaceCreative,
  CreativeSection,
  WorkspaceCreative,
  WorkspaceCreativePage,
} from "@telegram-system/shared";
import { workspaceCreativesApi } from "@/lib/features/workspace/workspace-creatives-api";
import { workspaceCreativeKeys } from "@/lib/query-keys";

export function useCreativeEncyclopedia(
  workspaceId: string,
  section: CreativeSection,
  entryId: string | null,
) {
  const client = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: workspaceCreativeKeys.list(workspaceId, section),
    queryFn: ({ pageParam, signal }) =>
      workspaceCreativesApi.list(workspaceId, section, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !entryId,
  });
  const detail = useQuery({
    queryKey: workspaceCreativeKeys.detail(workspaceId, entryId),
    queryFn: ({ signal }) =>
      workspaceCreativesApi.get(workspaceId, entryId!, signal),
    enabled: Boolean(entryId),
    retry: false,
  });

  const create = useMutation({
    mutationFn: ({
      input,
      file,
    }: {
      input: CreateWorkspaceCreative;
      file: File | null;
    }) => workspaceCreativesApi.create(workspaceId, input, file),
    onSuccess: async (entry) => {
      const queryKey = workspaceCreativeKeys.list(workspaceId, entry.section);
      await client.cancelQueries({ queryKey });
      if (!client.getQueryData(queryKey)) {
        void client.invalidateQueries({ queryKey, exact: true });
      }
      client.setQueryData<InfiniteData<WorkspaceCreativePage>>(
        queryKey,
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page, index) =>
              index === 0
                ? {
                    ...page,
                    items: [
                      entry,
                      ...page.items.filter(({ id }) => id !== entry.id),
                    ],
                  }
                : page,
            ),
          },
      );
      client.setQueryData(
        workspaceCreativeKeys.detail(workspaceId, entry.id),
        entry,
      );
    },
  });

  async function changeCachedEntry(
    entry: WorkspaceCreative,
    update: (item: WorkspaceCreative) => WorkspaceCreative | undefined,
  ) {
    const listKey = workspaceCreativeKeys.list(workspaceId, entry.section);
    const detailKey = workspaceCreativeKeys.detail(workspaceId, entry.id);
    await Promise.all([
      client.cancelQueries({ queryKey: listKey }),
      client.cancelQueries({ queryKey: detailKey }),
    ]);
    client.setQueryData<InfiniteData<WorkspaceCreativePage>>(
      listKey,
      (data) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.flatMap((item) => {
              if (item.id !== entry.id) return [item];
              const next = update(item);
              return next ? [next] : [];
            }),
          })),
        },
    );
    const current = client.getQueryData<WorkspaceCreative>(detailKey);
    if (current) {
      const next = update(current);
      if (next) client.setQueryData(detailKey, next);
      else client.removeQueries({ queryKey: detailKey });
    }
  }

  const comment = useMutation({
    mutationFn: ({ entry, text }: { entry: WorkspaceCreative; text: string }) =>
      workspaceCreativesApi.comment(workspaceId, entry.id, text),
    onSuccess: (added, { entry }) =>
      changeCachedEntry(entry, (current) => ({
        ...current,
        comments: current.comments.some(({ id }) => id === added.id)
          ? current.comments
          : [...current.comments, added],
      })),
  });
  const remove = useMutation({
    mutationFn: (entry: WorkspaceCreative) =>
      workspaceCreativesApi.remove(workspaceId, entry.id),
    onSuccess: (_data, entry) => changeCachedEntry(entry, () => undefined),
  });

  return { list, detail, create, comment, remove };
}
