"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CrmContactListItem,
  CrmContactStage,
  CrmContactsListResult,
} from "@telegram-system/shared";
import {
  Button,
  EmptyState,
  Input,
  MasonryGrid,
} from "@/components/ui/primitives";
import {
  Pagination,
  THREE_COLUMN_GRID_PAGE_SIZES,
} from "@/components/ui/pagination";
import { authApi, workspaceMembersApi } from "@/lib/api";
import { authKeys, memberKeys } from "@/lib/query-keys";
import {
  telegramCrmApi,
  type CrmContactsParams,
} from "@/lib/features/growth/telegram-crm-api";
import {
  patchCrmContactCaches,
  telegramCrmKeys,
} from "@/lib/features/growth/telegram-crm-query";
import { crmText } from "./crm-copy";
import { crmPermissions } from "./crm-permissions";
import {
  CrmContactActionModal,
  type CrmContactAction,
} from "./crm-contact-action-modal";
import { CrmContactCard } from "./crm-contact-card";
import {
  crmContactChatPreview,
  type CrmContactChatPreview,
} from "./crm-contact-chat-preview";
import {
  CrmContactStageFilters,
  crmContactStageFromSearchParams,
  crmContactStageSearchParams,
  useCrmContactStagePreference,
  writeCrmContactStagePreference,
} from "./crm-contact-stage-filter";
import {
  CrmContactsSkeleton,
  CrmMinimizedChatLauncher,
} from "./crm-contact-card-support";

export { CrmContactCard } from "./crm-contact-card";
export {
  CrmContactStageFilters,
  crmContactStageFromSearchParams,
  crmContactStageSearchParams,
  readCrmContactStagePreference,
  useCrmContactStagePreference,
  writeCrmContactStagePreference,
} from "./crm-contact-stage-filter";

export function CrmContactList({
  initialContactId,
  initialConversationId,
}: {
  initialContactId?: string;
  initialConversationId?: string;
} = {}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const urlStageFilter = crmContactStageFromSearchParams(searchParams);
  const storedStageFilter = useCrmContactStagePreference();
  const stageFilter = searchParams.has("stage")
    ? urlStageFilter
    : storedStageFilter;
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [localSelectedAction, setLocalSelectedAction] = useState<{
    contactId: string;
    action: CrmContactAction;
  } | null>(null);
  const persistedContactId =
    searchParams.get("crmContact") ?? initialContactId ?? null;
  const [openChatIds, setOpenChatIds] = useState<string[]>(() => {
    const stored =
      searchParams.get("crmChats")?.split(",").filter(Boolean) ?? [];
    return stored.length
      ? stored
      : persistedContactId
        ? [persistedContactId]
        : [];
  });
  const [chatPreviews, setChatPreviews] = useState<
    Record<string, CrmContactChatPreview>
  >({});
  const [activeChatId, setActiveChatId] = useState<string | null>(() =>
    initialConversationId || searchParams.get("crmAction") === "conversations"
      ? persistedContactId
      : null,
  );
  const [chatMinimized, setChatMinimized] = useState(
    () =>
      openChatIds.length > 0 &&
      searchParams.get("crmAction") !== "conversations",
  );

  const persistChats = (ids: string[], active: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (ids.length && !(ids.length === 1 && active === ids[0]))
      next.set("crmChats", ids.join(","));
    else next.delete("crmChats");
    if (active) {
      next.set("crmContact", active);
      next.set("crmAction", "conversations");
    } else {
      next.delete("crmContact");
      next.delete("crmAction");
    }
    router.replace(next.size ? `${pathname}?${next.toString()}` : pathname, {
      scroll: false,
    });
  };
  const openAction = (
    contact: CrmContactListItem,
    action: CrmContactAction,
  ) => {
    if (action !== "conversations") {
      setLocalSelectedAction({ contactId: contact.id, action });
      return;
    }
    const nextIds = openChatIds.includes(contact.id)
      ? openChatIds
      : [...openChatIds, contact.id];
    setChatPreviews((current) => ({
      ...current,
      [contact.id]: crmContactChatPreview(contact),
    }));
    setOpenChatIds(nextIds);
    setActiveChatId(contact.id);
    setChatMinimized(false);
    persistChats(nextIds, contact.id);
  };
  const closeChat = (contactId: string) => {
    const nextIds = openChatIds.filter((id) => id !== contactId);
    const nextActive = nextIds.at(-1) ?? null;
    setOpenChatIds(nextIds);
    setActiveChatId(nextActive);
    if (!nextActive) setChatMinimized(false);
    persistChats(nextIds, nextActive);
  };
  const minimizeChats = () => {
    setChatMinimized(true);
    persistChats(openChatIds, null);
  };
  const restoreChats = () => {
    const nextActive = activeChatId ?? openChatIds.at(-1) ?? null;
    if (!nextActive) return;
    setActiveChatId(nextActive);
    setChatMinimized(false);
    persistChats(openChatIds, nextActive);
  };

  const me = useQuery({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
  });
  const members = useQuery({
    queryKey: memberKeys.membersSelect(),
    queryFn: workspaceMembersApi.select,
  });
  const permissions = crmPermissions(me.data?.workspace.access);
  const currentMemberId = members.data?.find(
    (member) => member.isCurrentUser,
  )?.id;
  const params = useMemo<CrmContactsParams>(
    () => ({
      page,
      pageSize,
      search: deferredSearch || undefined,
      stage: !stageFilter || stageFilter === "ALL" ? undefined : stageFilter,
      archived: !stageFilter || stageFilter === "ALL" ? false : undefined,
    }),
    [deferredSearch, page, pageSize, stageFilter],
  );
  const query = useQuery({
    queryKey: telegramCrmKeys.contactList(params),
    queryFn: ({ signal }) => telegramCrmApi.listContacts(params, signal),
    enabled: stageFilter !== null,
  });
  const visibleChatPreviews = useMemo(() => {
    const result = { ...chatPreviews };
    for (const contact of query.data?.items ?? []) {
      if (openChatIds.includes(contact.id)) {
        result[contact.id] = crmContactChatPreview(contact);
      }
    }
    return result;
  }, [chatPreviews, openChatIds, query.data?.items]);
  const showContactsSkeleton =
    stageFilter === null || query.isLoading || query.isFetching;
  const updateStage = useMutation({
    mutationFn: ({
      contactId,
      stage,
    }: {
      contactId: string;
      stage: CrmContactStage;
    }) => telegramCrmApi.updateContact(contactId, { stage }),
    onSuccess: (contact) => patchCrmContactCaches(queryClient, contact),
  });
  const replyMute = useMutation({
    mutationFn: ({ contactId, muted }: { contactId: string; muted: boolean }) =>
      telegramCrmApi.setReplyAlertMuted(contactId, { muted }),
    onMutate: async ({ contactId, muted }) => {
      await queryClient.cancelQueries({
        queryKey: telegramCrmKeys.contactLists(),
      });
      const snapshots = queryClient.getQueriesData<CrmContactsListResult>({
        queryKey: telegramCrmKeys.contactLists(),
      });
      queryClient.setQueriesData<CrmContactsListResult>(
        { queryKey: telegramCrmKeys.contactLists() },
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.id === contactId
                    ? { ...item, replySummary: { ...item.replySummary, muted } }
                    : item,
                ),
              }
            : current,
      );
      return { snapshots };
    },
    onSuccess: (result, variables) =>
      queryClient.setQueriesData<CrmContactsListResult>(
        { queryKey: telegramCrmKeys.contactLists() },
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.id === variables.contactId
                    ? { ...item, replySummary: result.replySummary }
                    : item,
                ),
              }
            : current,
      ),
    onError: (_error, _variables, context) =>
      context?.snapshots.forEach(([key, data]) =>
        queryClient.setQueryData(key, data),
      ),
  });

  return (
    <section>
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <CrmContactStageFilters
            value={stageFilter ?? "ALL"}
            onChange={(stage) => {
              setPage(1);
              writeCrmContactStagePreference(window.localStorage, stage);
              const next = crmContactStageSearchParams(searchParams, stage);
              router.replace(
                next.size ? `${pathname}?${next.toString()}` : pathname,
                { scroll: false },
              );
            }}
          />
        </div>
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search contacts"
          aria-label="Search contacts"
          className="w-full shrink-0 lg:max-w-sm"
        />
      </div>
      {showContactsSkeleton ? <CrmContactsSkeleton count={pageSize} /> : null}
      {query.error ? (
        <div className="py-6 text-center">
          <p className="mb-2 text-sm text-rose-300">
            Contacts could not be loaded.
          </p>
          <Button variant="secondary" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
      {!showContactsSkeleton && !query.error && !query.data?.items.length ? (
        <EmptyState text={crmText("states.emptyContacts")} />
      ) : null}
      {!showContactsSkeleton && query.data?.items.length ? (
        <div aria-label="Contacts">
          <MasonryGrid>
            {query.data.items.map((contact) => {
              const canEdit =
                !contact.isUnassignedClient &&
                (permissions.canEditAll ||
                  (permissions.canEditOwn &&
                    currentMemberId === contact.ownerMemberId));
              return (
                <CrmContactCard
                  key={contact.id}
                  contact={contact}
                  canViewSales={permissions.canViewSales}
                  canCreateSales={permissions.canCreateSales}
                  canEdit={Boolean(canEdit)}
                  stagePending={
                    updateStage.isPending &&
                    updateStage.variables?.contactId === contact.id
                  }
                  replyMutePending={
                    replyMute.isPending &&
                    replyMute.variables?.contactId === contact.id
                  }
                  onStageChange={(stage) =>
                    updateStage.mutate({ contactId: contact.id, stage })
                  }
                  onReplyMuteChange={(muted) =>
                    replyMute.mutate({ contactId: contact.id, muted })
                  }
                  onAction={(action) => openAction(contact, action)}
                />
              );
            })}
          </MasonryGrid>
        </div>
      ) : null}
      {!showContactsSkeleton && query.data ? (
        <div className={chatMinimized ? "pr-20" : undefined}>
          <Pagination
            {...query.data.pagination}
            pageSizeOptions={THREE_COLUMN_GRID_PAGE_SIZES}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPage(1);
              setPageSize(size);
            }}
            loading={query.isFetching}
          />
        </div>
      ) : null}
      {localSelectedAction ? (
        <CrmContactActionModal
          contactId={localSelectedAction.contactId}
          action={localSelectedAction.action}
          onClose={() => setLocalSelectedAction(null)}
        />
      ) : null}
      {activeChatId && !chatMinimized ? (
        <CrmContactActionModal
          contactId={activeChatId}
          action="conversations"
          chatContactIds={openChatIds}
          chatPreviews={visibleChatPreviews}
          initialConversationId={
            activeChatId === initialContactId
              ? initialConversationId
              : undefined
          }
          onSelectChat={(contactId) => {
            setActiveChatId(contactId);
            persistChats(openChatIds, contactId);
          }}
          onMinimize={minimizeChats}
          onClose={() => closeChat(activeChatId)}
        />
      ) : null}
      {openChatIds.length && chatMinimized ? (
        <CrmMinimizedChatLauncher
          count={openChatIds.length}
          onRestore={restoreChats}
        />
      ) : null}
    </section>
  );
}
