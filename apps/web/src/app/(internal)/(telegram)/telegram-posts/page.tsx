"use client";
import { formatDate, formatDateTime, formatDateWithWeekday } from "@/lib/date-format";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import * as Slider from "@radix-ui/react-slider";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Clock3,
  FileText,
  FolderPlus,
  GripVertical,
  History,
  Layers3,
  ListPlus,
  LoaderCircle,
  MoveRight,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Rocket,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { IconPicker } from "@/components/icons/icon-picker";
import { AppShell } from "@/components/layout/app-shell";
import { PageTabHead } from "@/components/layout/page-tab-head";
import { ManagedPostsImportModal } from "@/components/features/telegram/telegram/managed-posts-import-modal";
import { AddPostsModal } from "@/components/features/telegram/telegram/add-posts-to-group-modal";
import { GptContextDownloadButton } from "@/components/features/telegram/telegram/gpt-context-download-button";
import { PostGroupsImportModal } from "@/components/features/telegram/telegram/post-groups-import-modal";
import { ChannelReimportDeleteModal } from "@/components/features/telegram/telegram/channel-reimport-delete-modal";
import {
  ChannelImportNavigation,
  type ChannelImportMode,
} from "@/components/features/telegram/telegram/channel-import-navigation";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
} from "@/components/features/telegram/telegram/telegram-card-actions-menu";
import { CalendarPostGroupSection } from "@/components/features/telegram/telegram/calendar-post-group-section";
import { AutoCalendarPlannerPreview } from "@/components/features/telegram/telegram/auto-calendar-planner-preview";
import { CalendarPlanImport } from "@/components/features/telegram/telegram/calendar-plan-import";
import { serializeCalendarPlanImport } from "@/components/features/telegram/telegram/calendar-plan-import-model";
import { useManagedPostDeepLink } from "@/components/features/telegram/telegram/use-managed-post-deep-link";
import { useManagedPostPageItems } from "@/components/features/telegram/telegram/managed-post-page";
import {
  LongImageTextModePanel,
  PostStatusIcon,
  publishModeLabel,
  managedPostScheduleUi,
  managedPostScheduleUnchanged,
  type LongTextMode,
} from "@/components/features/telegram/telegram/managed-post-presentation";
import {
  AddTimePostButton,
  TimePostsControl,
} from "@/components/features/telegram/telegram/telegram-time-posts-control";
import {
  ManagedPostTelegramIdentityIndicator,
  ManagedPostTelegramLink,
} from "@/components/features/telegram/telegram/managed-post-telegram-link";
import {
  buildManagedPostInternalLinks,
  canScheduleManagedPost,
  hasBlockingManagedPostInternalLinks,
  ManagedPostInternalLinksNotice,
} from "@/components/features/telegram/telegram/managed-post-internal-links-notice";
import { TelegramImageUpload } from "@/components/features/telegram/telegram/telegram-image-upload";
import {
  TelegramTextEditor,
  type TelegramTextEditorHandle,
} from "@/components/features/telegram/telegram/telegram-text-editor";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import { TelegramCustomEmojiPacksModal } from "@/components/features/telegram/telegram/telegram-custom-emoji-packs-modal";
import {
  mapManagedPostPages,
  reconcileManagedPost,
  restoreManagedPostPages,
  snapshotManagedPostPages,
} from "@/components/features/telegram/telegram/managed-post-cache";
import { useManagedPostDueRefresh } from "@/components/features/telegram/telegram/use-managed-post-due-refresh";
import { ManagedPostHistoryModal } from "@/components/features/telegram/telegram/managed-post-history-modal";
import { ManagedPostExportButton } from "@/components/features/telegram/telegram/managed-post-export-button";
import { ManagedPostReadOnlyPanel } from "@/components/features/telegram/telegram/managed-post-read-only-panel";
import { ManagedPostSearchInput } from "@/components/features/telegram/telegram/managed-post-search-input";
import { PostGroupCardsSkeleton } from "@/components/features/telegram/telegram/post-group-cards-skeleton";
import { useManagedPostSearch } from "@/components/features/telegram/telegram/use-managed-post-search";
import {
  expandDeepLinkedPostGroup,
  managedPostStatusTab,
  type ManagedPostStatusTab,
} from "@/components/features/telegram/telegram/managed-post-deep-link";
import { ResetChannelScheduledPostsButton } from "@/components/features/telegram/telegram/reset-channel-scheduled-posts-button";
import { MemberBadge } from "@/components/features/workspace/member-badge";
import { MemberSelect } from "@/components/features/workspace/member-select";
import {
  iconsApi,
  telegramAdSalesApi,
  telegramChannelsApi,
  workspaceMembersApi,
  type BulkActionResult,
  type BulkActionResultItem,
  type PostGroup,
  type ResolvedEmoji,
  type TelegramChannelSelectOption as TelegramChannel,
  type TelegramManagedPost,
  type TelegramManagedPostRevision,
  type TelegramChannelTimePost,
  type WorkspaceMemberSelectOption as WorkspaceMember,
} from "@/lib/api";
import {
  buildCalendarDayScheduleSlots,
  getCalendarSchedulablePosts,
  localTimeKey,
  shuffleCalendarSchedulablePosts,
  sortScheduleManagedPostAssignments,
} from "@/lib/features/telegram/telegram-calendar-scheduler";
import {
  normalizePlannerFormatWeights,
  redistributePlannerFormatWeight,
} from "@/lib/features/telegram/telegram-planner-weights";
import {
  buildTelegramPostsLegacyRedirectUrl,
  buildTelegramPostsUrl,
  type TelegramPostsRouteView,
} from "@/lib/features/telegram/telegram-posts-url";
import {
  getManagedPostDisplayNumber,
  normalizeManagedPostNumbering,
} from "@/lib/features/telegram/telegram-post-numbering";
import { extractAutoPrefilledPostTitle } from "@/lib/features/telegram/telegram-post-title";
import { telegramPostGroupTitle } from "@/components/features/telegram/telegram/telegram-post-group-title";
import {
  calendarWeekdays,
  addDays,
  addMonths,
  buildCalendarDays,
  calendarGridStart,
  calendarGridEnd,
  calendarStatusIcon,
  calendarStatusTone,
  endOfDay,
  endOfMonth,
  monthLabel,
  sameMonth,
  startOfDay,
  startOfMonth,
  timeLabel,
  toLocalDateKey,
} from "@/components/features/telegram/telegram/telegram-posts-calendar-view";
import { telegramSyncedPostGroup } from "@/components/features/telegram/telegram/telegram-synced-post-group";
import { memberKeys, telegramChannelKeys, telegramPostKeys } from "@/lib/query-keys";
import {
  type ScheduleManagedPostsBatchItem,
  type TelegramManagedPostCalendarResult,
  type TelegramPostPlannerPreviewResult,
  type TelegramPostPlannerFormat,
  type TelegramPostPlannerSlot,
  type TelegramPostButtonRows,
  TELEGRAM_AD_PLACEMENT_STATUS_KEYS,
  TELEGRAM_MANAGED_POST_STATUS_KEYS,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  CustomSelect,
  DateInput,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  Modal,
  MultiSelect,
  PageHeader,
  Textarea,
  TimeInput,
  ToggleRow,
  TooltipBubble,
  isValidTimeInputValue,
} from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";
import { useI18n, type TranslationFunction } from "@/providers/i18n-provider";
import type { I18nNamespace } from "@/i18n/catalog";
import { safeApiErrorMessage } from "@/i18n/error-localization";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import {
  BulkProgressOverlay,
  localizedBulkActionMessage,
  type ProgressState,
} from "@/components/features/telegram/telegram/telegram-posts-workspace-controls";
type PublishingMode = "draft" | "publish" | "schedule";
type PostStatusTab = ManagedPostStatusTab;
type PostViewMode = Exclude<TelegramPostsRouteView, "groups">;
type InitialPostView = TelegramPostsRouteView | null;
type TelegramPostsPageProps = {
  routeChannelId?: string | null;
  routePostView?: TelegramPostsRouteView | null;
};
type PendingPostSave = {
  id: string;
  title: string;
  icon?: string | null;
  groupId?: string | null;
  mode: PublishingMode;
};
type PlannerSlotDraft = {
  timePostIds: string[];
  groupIds: string[];
};
type PlannerSlotEditDraft = PlannerSlotDraft;
type PlannerSlotDisplayGroup = {
  id: string;
  slots: TelegramPostPlannerSlot[];
  timePostIds: string[];
  groupIds: string[];
};
type PlannerFormatDraft = {
  name: string;
  icon: string;
};
function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}
function plannerSlotDisplayGroupKey(slot: TelegramPostPlannerSlot) {
  return [
    [...slot.postGroupIds].sort().join("|") || "any",
    slot.weekday ?? "any-day",
    slot.timezone ?? "local",
    slot.isActive ? "active" : "inactive",
  ].join("::");
}

const plannerFormatWeightsPreferenceKey = (channelId: string) =>
  `telegram-posts-planner-format-weights:${channelId}`;
function selectIconProps(icon?: ResolvedEmoji | null) {
  if (!icon) return {};
  if (icon.type === "image") return { iconUrl: icon.url };
  return { iconEmoji: icon.value };
}
function plannerFormatResolvedIcon(icon?: string | null): ResolvedEmoji | null {
  const value = icon?.trim();
  return value ? { type: "unicode", value, name: value } : null;
}
function PlannerFormatEmojiPicker({
  value,
  disabled,
  className = "h-9 w-9",
  iconClassName = "!h-5 !w-5 !bg-transparent",
  onChange,
  onError,
}: {
  value?: string | null;
  disabled?: boolean;
  className?: string;
  iconClassName?: string;
  onChange: (nextIcon: string | null) => void | Promise<void>;
  onError: (error: unknown) => void;
}) {
  const { t } = useI18n();
  const handleEmojiChange = async (emoji: string | null) => {
    await onChange(emoji);
  };
  return (
    <IconPicker
      compact
      allowImages={false}
      disabled={disabled}
      icon={plannerFormatResolvedIcon(value)}
      onChange={() => {}}
      onEmojiChange={(emoji) => {
        void handleEmojiChange(emoji).catch(onError);
      }}
      buttonLabel={t("telegram.posts.icon.addEmoji")}
      className={className}
      iconClassName={iconClassName}
    />
  );
}
function PlannerFormatWeightSlider({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const percent = Math.max(0, Math.min(100, value));
  return (
    <Slider.Root
      value={[percent]}
      min={0}
      max={100}
      step={1}
      disabled={disabled}
      onValueChange={([nextValue]) => onChange(nextValue ?? 0)}
      className="relative flex h-8 w-full touch-none select-none items-center data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60"
      aria-label={label}
    >
      <Slider.Track className="relative h-2 grow overflow-hidden rounded-full bg-neutral-800">
        <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
      </Slider.Track>
      <Slider.Thumb
        className="block h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow-sm shadow-black/50 outline-none ring-blue-500/30 transition focus-visible:ring-4"
        aria-label={label}
      />
    </Slider.Root>
  );
}
type PostSidebarSection = {
  key: string;
  group: EffectivePostGroup | null;
  posts: TelegramManagedPost[];
  pendingPosts: PendingPostSave[];
};
type EffectivePostGroup = PostGroup | NonNullable<TelegramManagedPost["group"]>;
const TELEGRAM_TEXT_MESSAGE_LIMIT = 4096;
const POST_OPEN_CLICK_DELAY_MS = 180;
const lastSelectedTelegramPostsChannelKey = "telegram-posts:last-selected-channel";
const postGroupPreferenceKey = (channelId: string) =>
  `telegram-posts-new-post-group:${channelId}`;
const workspaceViewPreferenceKey = (channelId: string) =>
  `telegram-posts-workspace-view:${channelId}`;
function localNowParts() {
  const now = new Date();
  return localDateTimeParts(now);
}
function localDateTimeParts(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      date: "",
      time: "",
    };
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}
function wantsNewTab(event: Pick<MouseEvent, "metaKey" | "ctrlKey">) {
  return event.metaKey || event.ctrlKey;
}
function shouldIgnoreModifiedPostOpen(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, input, select, textarea, [role="button"], [role="checkbox"], [role="combobox"]',
    ),
  );
}
function isBrokenPublishedPost(post: TelegramManagedPost) {
  return (
    post.status === "PUBLISHED" &&
    ["BROKEN", "MISSING"].includes(post.telegramRemoteStatus)
  );
}
function managedPostStatusKey(status: TelegramManagedPost["status"]) {
  return TELEGRAM_MANAGED_POST_STATUS_KEYS[status];
}
function remoteStatusKey(status: string) {
  if (status === "PUBLISHED") return "telegramPosts.status.published" as const;
  if (status === "SCHEDULED") return "telegramPosts.status.scheduled" as const;
  if (status === "MISSING") return "telegram.posts.remoteStatus.missing" as const;
  if (status === "BROKEN") return "telegram.posts.remoteStatus.broken" as const;
  return "telegram.posts.remoteStatus.unknown" as const;
}

function formatManagedPostRevisionReason(t: TranslationFunction, reason: string) {
  switch (reason) {
    case "before_update":
      return t("telegram.posts.history.beforeEdit");
    case "before_publish":
      return t("telegram.posts.history.beforePublish");
    case "before_schedule":
      return t("telegram.posts.history.beforeSchedule");
    case "before_manual_link":
      return t("telegram.posts.history.beforeManualLink");
    case "before_sync_missing":
      return t("telegram.posts.history.beforeSyncMissing");
    case "before_sync_broken":
      return t("telegram.posts.history.beforeSyncBroken");
    case "before_sync_publish_transition":
      return t("telegram.posts.history.beforeSyncPublished");
    case "before_sync_update":
      return t("telegram.posts.history.beforeSyncUpdate");
    case "before_restore":
      return t("telegram.posts.history.beforeRestore");
    case "before_delete":
      return t("telegram.posts.history.beforeDelete");
    default:
      return t("telegram.posts.history.change");
  }
}

function scheduleDateForPreset(time: string) {
  const now = new Date();
  const [hours, minutes] = time.split(":").map((value) => Number(value));
  const candidate = new Date(now);
  candidate.setHours(hours, minutes, 0, 0);
  if (candidate.getTime() < now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return localDateTimeParts(candidate).date;
}

export function TelegramPostsPageClient({
  routeChannelId,
  routePostView,
}: TelegramPostsPageProps = {}) {
  const { locale, t, ensureNamespaces, hasNamespaces } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { pushToast, setProgress, clearProgress } = useAppToast();
  const [newPostToken, setNewPostToken] = useState(0);
  const [newGroupRequested, setNewGroupRequested] = useState(false);
  const [importMode, setImportMode] = useState<ChannelImportMode | null>(null);
  useEffect(() => {
    if (importMode) void ensureNamespaces(["telegram/posts/import"]);
  }, [ensureNamespaces, importMode]);
  const importTranslationsReady = hasNamespaces(["telegram/posts/import"]);
  const routeChannelIdValue = routeChannelId?.trim() || "";
  const channelId = routeChannelIdValue || searchParams.get("channelId") || "";
  const postId = searchParams.get("postId") || "";
  const groupId = searchParams.get("groupId") || "";
  const [pageWorkspaceView, setPageWorkspaceView] = useState<"posts" | "groups">(
    routePostView === "groups" || groupId ? "groups" : "posts",
  );
  const initialPostView = (() => {
    if (routePostView) return routePostView;
    const value = searchParams.get("postView");
    if (value === "calendar") return "calendar";
    if (value === "editor") return "editor";
    return null;
  })();
  const currentRoutePostView: PostViewMode =
    initialPostView === "calendar" ? "calendar" : "editor";
  const routeNamespaces = useMemo<I18nNamespace[]>(
    () => [
      "ad-sales/common",
      "telegram/posts/common",
      pageWorkspaceView === "groups"
        ? "telegram/posts/groups"
        : currentRoutePostView === "calendar"
          ? "telegram/posts/calendar"
          : "telegram/posts/editor",
    ],
    [currentRoutePostView, pageWorkspaceView],
  );
  useEffect(() => {
    void ensureNamespaces(routeNamespaces);
  }, [ensureNamespaces, routeNamespaces]);
  const routeTranslationsReady = hasNamespaces(routeNamespaces);
  const legacyRedirectUrl = useMemo(
    () =>
      routeChannelIdValue ? null : buildTelegramPostsLegacyRedirectUrl(searchParams),
    [routeChannelIdValue, searchParams],
  );
  const channels = useQuery({
    queryKey: telegramChannelKeys.select({ canPostMessagesOnly: true }),
    queryFn: () => telegramChannelsApi.select({ canPostMessagesOnly: true }),
  });
  const availableChannels = channels.data || [];
  const channel =
    availableChannels.find((item) => item.id === channelId) || availableChannels[0];
  useEffect(() => {
    if (!legacyRedirectUrl) return;
    router.replace(legacyRedirectUrl);
  }, [legacyRedirectUrl, router]);

  useEffect(() => {
    if (typeof window === "undefined" || !availableChannels.length) return;
    const params = new URLSearchParams(searchParams.toString());
    const savedChannelId = window.localStorage.getItem(
      lastSelectedTelegramPostsChannelKey,
    );
    const savedChannelStillAvailable = savedChannelId
      ? availableChannels.some((item) => item.id === savedChannelId)
      : false;

    if (channelId) {
      const requestedChannelStillAvailable = availableChannels.some(
        (item) => item.id === channelId,
      );
      if (requestedChannelStillAvailable) {
        window.localStorage.setItem(lastSelectedTelegramPostsChannelKey, channelId);
        return;
      }

      const fallbackChannelId = savedChannelStillAvailable
        ? savedChannelId
        : availableChannels[0]?.id;
      if (!fallbackChannelId) return;
      params.delete("postId");
      router.replace(
        buildTelegramPostsUrl({
          channelId: fallbackChannelId,
          groupId: params.get("groupId"),
          postView: params.get("groupId") ? null : currentRoutePostView,
          extraParams: params,
        }),
      );
      return;
    }

    const fallbackChannelId = savedChannelStillAvailable
      ? savedChannelId
      : availableChannels[0]?.id;
    if (!fallbackChannelId) return;
    router.replace(
      buildTelegramPostsUrl({
        channelId: fallbackChannelId,
        groupId: params.get("groupId"),
        postView: params.get("groupId") ? null : currentRoutePostView,
        extraParams: params,
      }),
    );
  }, [availableChannels, channelId, currentRoutePostView, router, searchParams]);

  useEffect(() => {
    if (routeChannelIdValue || !channelId || groupId || initialPostView) return;
    router.replace(
      buildTelegramPostsUrl({
        channelId,
        postId: postId || null,
        postView: "editor",
      }),
    );
  }, [channelId, groupId, initialPostView, postId, routeChannelIdValue, router]);

  const navigateToChannel = (nextChannelId: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(lastSelectedTelegramPostsChannelKey, nextChannelId);
    }
    router.push(
      buildTelegramPostsUrl({
        channelId: nextChannelId,
        postView: pageWorkspaceView === "groups" ? "groups" : currentRoutePostView,
      }),
    );
  };

  if (!routeTranslationsReady) {
    return (
      <AppShell>
        <LoadingState />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title={t("telegram.posts.title")}
        subtitle={t("telegram.posts.subtitle")}
        action={
          channel ? (
            <div className="flex w-full flex-col gap-2 sm:min-w-[620px] sm:flex-row">
              <div className="min-w-0 flex-1 [&>div>button]:h-[42px] [&>div>button]:min-h-0">
                <CustomSelect
                  uiLocale={locale}
                  value={channel.id}
                  onChange={navigateToChannel}
                  options={availableChannels.map((item) => ({
                    value: item.id,
                    label: item.title,
                    iconUrl: item.photoUrl || undefined,
                    iconFallback: item.title,
                  }))}
                />
              </div>
              <TelegramCardActionsMenu
                label={t("telegram.posts.channelActions")}
                keepMounted
                triggerClassName="!h-[42px] !w-[42px] shrink-0 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
              >
                <TelegramCardMenuAction
                  label={t("common.import")}
                  icon={<Upload size={17} />}
                  onClick={() =>
                    setImportMode(pageWorkspaceView === "groups" ? "groups" : "posts")
                  }
                />
                <TelegramCardMenuAction
                  label={t("telegram.posts.newPost")}
                  icon={<Plus size={17} />}
                  onClick={() => {
                    router.replace(
                      buildTelegramPostsUrl({
                        channelId: channel.id,
                        postView: "editor",
                      }),
                    );
                    setPageWorkspaceView("posts");
                    setNewPostToken((value) => value + 1);
                  }}
                />
                <TelegramCardMenuAction
                  label={t("telegram.posts.newGroup")}
                  icon={<FolderPlus size={17} />}
                  onClick={() => {
                    router.replace(
                      buildTelegramPostsUrl({
                        channelId: channel.id,
                        postView: "groups",
                      }),
                    );
                    setPageWorkspaceView("groups");
                    setNewGroupRequested(true);
                  }}
                />
                <TimePostsControl
                  channelId={channel.id}
                  timePosts={channel.timePosts || []}
                  presentation="menu"
                />
                <GptContextDownloadButton
                  channelId={channel.id}
                  channelTitle={channel.title}
                  presentation="menu"
                />
                <ResetChannelScheduledPostsButton
                  channelId={channel.id}
                  channelTitle={channel.title}
                  presentation="menu"
                  onCompleted={() => {
                    router.replace(
                      buildTelegramPostsUrl({
                        channelId: channel.id,
                        postView: "editor",
                      }),
                    );
                    setNewPostToken((value) => value + 1);
                  }}
                />
              </TelegramCardActionsMenu>
            </div>
          ) : undefined
        }
      />
      {channel && importTranslationsReady ? (
        <ManagedPostsImportModal
          open={importMode === "posts"}
          onClose={() => setImportMode(null)}
          channelId={channel.id}
          channelTitle={channel.title}
          channelPhotoUrl={channel.photoUrl}
          channelTelegramChatId={channel.telegramChatId}
          captionLengthMax={channel.publishingCapabilities.captionLengthMax}
          messageLengthMax={channel.publishingCapabilities.messageLengthMax}
          mode="posts"
          onModeChange={setImportMode}
        />
      ) : null}
      {channel && importTranslationsReady ? (
        <PostGroupsImportModal
          open={importMode === "groups"}
          channelId={channel.id}
          onClose={() => setImportMode(null)}
          mode="groups"
          onModeChange={setImportMode}
          onImported={async () => {
            await queryClient.invalidateQueries({
              queryKey: telegramPostKeys.postGroups(channel.id),
            });
          }}
        />
      ) : null}
      {channel && importTranslationsReady ? (
        <ChannelReimportDeleteModal
          open={importMode === "reimport"}
          channelId={channel.id}
          mode="reimport"
          onModeChange={setImportMode}
          onClose={() => setImportMode(null)}
        />
      ) : null}
      {channels.isLoading ? <LoadingState /> : null}
      {!channels.isLoading && !channels.error && !availableChannels.length ? (
        <EmptyState text={t("telegram.posts.noChannels")} />
      ) : null}
      {channel ? (
        <div>
          <TelegramPostWorkspace
            key={channel.id}
            channelId={channel.id}
            channelTitle={channel.title}
            channelPhotoUrl={channel.photoUrl}
            channelUsername={channel.username}
            channelTelegramChatId={channel.telegramChatId}
            channelTimePosts={channel.timePosts || []}
            channelPublishingCapabilities={channel.publishingCapabilities}
            newPostToken={newPostToken}
            newGroupRequested={newGroupRequested}
            onNewGroupRequestHandled={() => setNewGroupRequested(false)}
            importMode={importMode}
            onImportModeChange={setImportMode}
            initialPostId={postId}
            initialGroupId={groupId}
            initialPostView={initialPostView}
            channels={availableChannels}
            onWorkspaceViewChange={setPageWorkspaceView}
            onPostSelect={(selectedPostId) => {
              router.replace(
                buildTelegramPostsUrl({
                  channelId: channel.id,
                  postId: selectedPostId,
                  postView: "editor",
                }),
              );
            }}
          />
        </div>
      ) : null}
    </AppShell>
  );
}

export default TelegramPostsPageClient;

function TelegramPostWorkspace({
  channelId,
  channelTitle,
  channelPhotoUrl,
  channelUsername,
  channelTelegramChatId,
  channelTimePosts,
  channelPublishingCapabilities,
  newPostToken,
  newGroupRequested,
  onNewGroupRequestHandled,
  importMode,
  onImportModeChange,
  initialPostId,
  initialGroupId,
  initialPostView,
  channels,
  onWorkspaceViewChange,
  onPostSelect,
}: {
  channelId: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  channelUsername?: string | null;
  channelTelegramChatId?: string | null;
  channelTimePosts: TelegramChannelTimePost[];
  channelPublishingCapabilities?: {
    source: { sourceId: string } | null;
    captionLengthMax: number;
    messageLengthMax: number;
    canPublishInlineButtons: boolean;
  } | null;
  newPostToken: number;
  newGroupRequested: boolean;
  onNewGroupRequestHandled: () => void;
  importMode: ChannelImportMode | null;
  onImportModeChange: (mode: ChannelImportMode | null) => void;
  initialPostId: string;
  initialGroupId: string;
  initialPostView: InitialPostView;
  channels: TelegramChannel[];
  onWorkspaceViewChange: (view: "posts" | "groups") => void;
  onPostSelect: (postId: string | null) => void;
}) {
  const { locale, t } = useI18n();
  const localizedApiError = useCallback(
    (error: unknown, fallback: string) =>
      safeApiErrorMessage(error, locale, t, fallback),
    [locale, t],
  );
  const router = useRouter();
  const restoredPostIdRef = useRef("");
  const queryClient = useQueryClient();
  const { pushToast, setProgress, clearProgress, startOperation } = useAppToast();
  const [customEmojiPacksOpen, setCustomEmojiPacksOpen] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<"posts" | "groups">(() => {
    if (typeof window === "undefined") return "posts";
    if (initialPostView === "groups") return "groups";
    if (initialGroupId) return "groups";
    return window.localStorage.getItem(workspaceViewPreferenceKey(channelId)) ===
      "groups"
      ? "groups"
      : "posts";
  });
  useEffect(
    () => onWorkspaceViewChange(workspaceView),
    [onWorkspaceViewChange, workspaceView],
  );
  useEffect(() => {
    if (!newGroupRequested) return;
    const timeout = window.setTimeout(() => {
      setWorkspaceView("groups");
      onWorkspaceViewChange("groups");
      window.localStorage.setItem(workspaceViewPreferenceKey(channelId), "groups");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [channelId, newGroupRequested, onWorkspaceViewChange]);
  const [postView, setPostView] = useState<PostViewMode>(() => {
    return initialPostView === "calendar" ? "calendar" : "editor";
  });
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() =>
    toLocalDateKey(new Date()),
  );
  const [calendarBatchSelectedPostIds, setCalendarBatchSelectedPostIds] = useState<
    string[]
  >([]);
  const [calendarPostSearch, setCalendarPostSearch] = useState("");
  const [calendarBatchTimeChoiceByPostId, setCalendarBatchTimeChoiceByPostId] =
    useState<Record<string, string>>({});
  const [calendarBatchCustomTimeByPostId, setCalendarBatchCustomTimeByPostId] =
    useState<Record<string, string>>({});
  const [calendarBatchBusy, setCalendarBatchBusy] = useState(false);
  const [showAdSalesOverlay, setShowAdSalesOverlay] = useState(true);
  const [autoPlannerMode] = useState<"system" | "import">("import");
  const [autoPlannerPreviewSource, setAutoPlannerPreviewSource] = useState<
    "system" | "import"
  >("import");
  const [autoPlannerBusy, setAutoPlannerBusy] = useState(false);
  const [autoPlannerDays, setAutoPlannerDays] = useState(7);
  const [autoPlannerFrom, setAutoPlannerFrom] = useState(() =>
    toLocalDateKey(new Date()),
  );
  const [autoPlannerTo, setAutoPlannerTo] = useState(() =>
    toLocalDateKey(addDays(new Date(), 6)),
  );
  const [newPlannerFormatName, setNewPlannerFormatName] = useState("");
  const [newPlannerFormatIcon, setNewPlannerFormatIcon] = useState("");
  const [plannerSlotDraftsByFormatId, setPlannerSlotDraftsByFormatId] = useState<
    Record<string, PlannerSlotDraft>
  >({});
  const [plannerSlotEditDraftsById, setPlannerSlotEditDraftsById] = useState<
    Record<string, PlannerSlotEditDraft>
  >({});
  const [deletingPlannerFormat, setDeletingPlannerFormat] =
    useState<TelegramPostPlannerFormat | null>(null);
  const [deletingPlannerSlotGroup, setDeletingPlannerSlotGroup] =
    useState<PlannerSlotDisplayGroup | null>(null);
  const [calendarPlannerFitFormatId, setCalendarPlannerFitFormatId] = useState<
    string | null
  >(null);
  const [calendarPlannerFitRerollOffset, setCalendarPlannerFitRerollOffset] =
    useState(0);
  const [plannerFormatWeights, setPlannerFormatWeights] = useState<
    Record<string, number>
  >(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(
        plannerFormatWeightsPreferenceKey(channelId),
      );
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });
  const [plannerFormatDraftsById, setPlannerFormatDraftsById] = useState<
    Record<string, PlannerFormatDraft>
  >({});
  const [editingPlannerFormatIds, setEditingPlannerFormatIds] = useState<string[]>(
    [],
  );
  const [editingPlannerSlotGroupIds, setEditingPlannerSlotGroupIds] = useState<
    string[]
  >([]);
  const [autoPlannerPreview, setAutoPlannerPreview] =
    useState<TelegramPostPlannerPreviewResult | null>(null);
  const [calendarPlanImportContent, setCalendarPlanImportContent] = useState("");
  const [autoPlannerRerollingDate, setAutoPlannerRerollingDate] = useState<
    string | null
  >(null);
  const [autoPlannerRerollOffsetsByDate, setAutoPlannerRerollOffsetsByDate] =
    useState<Record<string, number>>({});
  const [editing, setEditing] = useState<TelegramManagedPost | null>(null);
  const [title, setTitle] = useState("");
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(null);
  const [memberSelectionTouched, setMemberSelectionTouched] = useState(false);
  const [text, setText] = useState("");
  const textEditorRef = useRef<TelegramTextEditorHandle | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [buttonRows, setButtonRows] = useState<TelegramPostButtonRows>([]);
  const [icon, setIcon] = useState<string | null>(null);
  const iconRef = useRef<string | null>(null);
  const iconAutofillRef = useRef<{ active: boolean; emoji: string | null }>({
    active: false,
    emoji: null,
  });
  const iconAutofillRequestRef = useRef(0);
  const [iconPickerGeneration, setIconPickerGeneration] = useState(0);
  const [iconPending, setIconPending] = useState(false);
  const [rememberedPostGroupId, setRememberedPostGroupId] = useState<string | null>(
    () => {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(postGroupPreferenceKey(channelId));
    },
  );
  const [postGroupId, setPostGroupId] = useState<string | null>(null);
  const [mode, setMode] = useState<PublishingMode>("draft");
  const [scheduleDate, setScheduleDate] = useState(() => localNowParts().date);
  const [scheduleTime, setScheduleTime] = useState(() => localNowParts().time);
  const [longTextMode, setLongTextMode] = useState<LongTextMode>("IMAGES_THEN_TEXT");
  const [statusTab, setStatusTab] = useState<PostStatusTab>("DRAFT");
  const [busy, setBusy] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [error, setError] = useState("");
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [highlightedInternalLinkTargetId, setHighlightedInternalLinkTargetId] =
    useState<string | null>(null);
  const [highlightRequestKey, setHighlightRequestKey] = useState(0);
  const [collapsedGroupIdsPreference, setCollapsedGroupIdsPreference] = useState<
    string[] | null
  >(null);
  const [draggedSidebarKey, setDraggedSidebarKey] = useState<string | null>(null);
  const [sidebarOrderKeys, setSidebarOrderKeys] = useState<string[]>([]);
  const sidebarReorderTimerRef = useRef<number | null>(null);
  const sidebarReorderVersionRef = useRef(0);
  const sidebarReorderQueueRef = useRef<Promise<void>>(Promise.resolve());
  const postOpenTimerRef = useRef<number | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deletingPost, setDeletingPost] = useState<TelegramManagedPost | null>(null);
  const [movingPost, setMovingPost] = useState<TelegramManagedPost | null>(null);
  const [restorePreviewRevision, setRestorePreviewRevision] =
    useState<TelegramManagedPostRevision | null>(null);
  const [restoreConfirmationValue, setRestoreConfirmationValue] = useState("");
  const [pendingPostSaves, setPendingPostSaves] = useState<PendingPostSave[]>([]);
  const [creatingPostId, setCreatingPostId] = useState<string | null>(null);
  const creatingPostIdRef = useRef<string | null>(null);
  const [savingPostIds, setSavingPostIds] = useState<string[]>([]);
  const postsPage = useQuery({
    queryKey: telegramPostKeys.managedList(channelId, {
      all: true,
    }),
    queryFn: () =>
      telegramChannelsApi.managedPostsPage(channelId, {
        all: true,
      }),
  });
  const deepLinkedPost = useManagedPostDeepLink({
    channelId,
    postId: initialPostId,
    queryClient,
  });
  const postsData = useManagedPostPageItems(
    postsPage.data?.items,
    deepLinkedPost.data,
  );
  const posts = {
    ...postsPage,
    data: postsData,
  };
  const customEmojiPacks = useQuery({
    queryKey: telegramChannelKeys.customEmojiPacks(channelId),
    queryFn: () => telegramChannelsApi.customEmojiPacks(channelId),
    enabled: Boolean(channelId) && workspaceView === "posts" && postView === "editor",
  });
  const refreshCustomEmojiPacks = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.customEmojiPacks(channelId),
    });
  }, [channelId, queryClient]);
  const calendarRange = useMemo(
    () => ({
      from: startOfDay(calendarGridStart(calendarMonth)).toISOString(),
      to: endOfDay(calendarGridEnd(calendarMonth)).toISOString(),
    }),
    [calendarMonth],
  );
  const calendarData = useQuery({
    queryKey: [
      "telegram-managed-posts-calendar",
      channelId,
      calendarRange.from,
      calendarRange.to,
    ],
    queryFn: () => telegramChannelsApi.managedPostsCalendar(channelId, calendarRange),
    enabled: workspaceView === "posts" && postView === "calendar",
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const adCalendarOverlay = useQuery({
    queryKey: [
      "telegram-ad-availability",
      "telegram-posts-overlay",
      channelId,
      calendarRange.from,
      calendarRange.to,
    ],
    queryFn: () =>
      telegramAdSalesApi.availability({
        from: calendarRange.from,
        to: calendarRange.to,
        channelIds: [channelId],
      }),
    enabled:
      workspaceView === "posts" && postView === "calendar" && showAdSalesOverlay,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const postGroups = useQuery({
    queryKey: ["post-groups", channelId],
    queryFn: () => telegramChannelsApi.postGroupSummaries(channelId),
    enabled: workspaceView === "posts",
  });
  const plannerFormats = useQuery({
    queryKey: telegramPostKeys.plannerFormats(channelId),
    queryFn: () => telegramChannelsApi.postPlannerFormats(channelId),
    enabled: false,
  });
  const plannerSlots = useQuery({
    queryKey: telegramPostKeys.plannerSlots(channelId),
    queryFn: () => telegramChannelsApi.postPlannerSlots(channelId),
    enabled: false,
  });
  const members = useQuery({
    queryKey: memberKeys.membersSelect(),
    queryFn: () => workspaceMembersApi.select(),
    enabled: workspaceView === "posts" && postView === "editor",
  });

  useEffect(() => {
    if (workspaceView !== "posts" || postView !== "editor") return;
    void queryClient.invalidateQueries({
      queryKey: ["telegram-managed-post-link-targets", channelId],
    });
  }, [channelId, postGroups.data, postView, posts.data, queryClient, workspaceView]);

  useEffect(
    () => () => {
      if (postOpenTimerRef.current) {
        window.clearTimeout(postOpenTimerRef.current);
      }
    },
    [],
  );

  const rememberPostGroup = (nextGroupId: string | null) => {
    setRememberedPostGroupId(nextGroupId);
    if (nextGroupId) {
      window.localStorage.setItem(postGroupPreferenceKey(channelId), nextGroupId);
    } else {
      window.localStorage.removeItem(postGroupPreferenceKey(channelId));
    }
  };
  const currentMemberId =
    members.data?.find((member) => member.isCurrentUser)?.id ?? null;
  const telegramImportedSystemGroup = useMemo(
    () =>
      (postGroups.data || []).find(
        (group) => group.systemKey === "TELEGRAM_IMPORTED",
      ) || null,
    [postGroups.data],
  );
  const postGroupsById = useMemo(
    () => new Map((postGroups.data || []).map((group) => [group.id, group])),
    [postGroups.data],
  );
  const syncedPostGroup = useMemo(
    () => telegramSyncedPostGroup(channelId, t("telegram.posts.support.synced")),
    [channelId, t],
  );
  const effectivePostGroup = (post: TelegramManagedPost) =>
    (post.groupId ? (postGroupsById.get(post.groupId) ?? post.group) : null) ??
    (post.origin === "TELEGRAM" && !post.groupId
      ? (telegramImportedSystemGroup ?? syncedPostGroup)
      : null);
  const effectivePostGroupId = (post: TelegramManagedPost) =>
    effectivePostGroup(post)?.id ?? post.groupId ?? null;
  const effectivePostMember = (post: TelegramManagedPost) =>
    post.assignedMember ?? null;
  const effectivePostMemberId = (post: TelegramManagedPost) =>
    effectivePostMember(post)?.id ?? post.assignedMemberId ?? null;
  const autoPrefilledTitle = useMemo(
    () => extractAutoPrefilledPostTitle(text),
    [text],
  );
  const liveEditingPost =
    editing && posts.data
      ? posts.data.find((post) => post.id === editing.id) || null
      : null;
  const editingMeta = liveEditingPost ?? editing;
  useManagedPostDueRefresh({ channelId, post: editingMeta });
  const isReadOnlyTelegramPost = Boolean(editingMeta?.readOnlyTelegramPost);
  const isPublished = editingMeta?.status === "PUBLISHED";
  const hasLockedTelegramMedia =
    editingMeta?.status === "PUBLISHED" || editingMeta?.status === "SCHEDULED";
  const displayedError = error || editingMeta?.lastError || "";
  const canReturnScheduledPostToDraft = Boolean(
    editingMeta?.status === "SCHEDULED" && editingMeta.origin !== "TELEGRAM",
  );
  const canManageTelegramLink = Boolean(
    editingMeta &&
    (editingMeta.status === "SCHEDULED" ||
      editingMeta.status === "PUBLISHED" ||
      editingMeta.status === "FAILED" ||
      ["BROKEN", "MISSING"].includes(editingMeta.telegramRemoteStatus) ||
      editingMeta.telegramLinkSource === "MANUAL" ||
      editingMeta.telegramMessageUrls.length > 0),
  );
  const telegramLinkBroken = Boolean(
    editingMeta && ["BROKEN", "MISSING"].includes(editingMeta.telegramRemoteStatus),
  );
  const publishedPostNeedsRepublish = Boolean(
    editingMeta?.status === "PUBLISHED" && telegramLinkBroken,
  );
  const effectivePublishingMode: PublishingMode = publishedPostNeedsRepublish
    ? "publish"
    : mode;
  const outgoingInternalLinks = useMemo(
    () => buildManagedPostInternalLinks(text, posts.data),
    [posts.data, text],
  );
  const internalLinkTargetIds = useMemo(
    () => outgoingInternalLinks.map((link) => link.targetId),
    [outgoingInternalLinks],
  );
  const incomingInternalLinkPosts = useMemo(() => {
    if (!editing) return [];
    return (posts.data || []).filter((post) => {
      if (post.id === editing.id) return false;
      const linkedIds = [
        ...new Set(
          [
            ...(post.text || "").matchAll(
              /\[[^\]\n]+\]\(tg-post:([a-zA-Z0-9_-]+)\)/g,
            ),
          ].map((match) => match[1]),
        ),
      ];
      return linkedIds.includes(editing.id);
    });
  }, [editing, posts.data]);
  const dependencyPublishBlocked =
    effectivePublishingMode === "publish" &&
    hasBlockingManagedPostInternalLinks(outgoingInternalLinks, channelTelegramChatId);
  const hasValidScheduleTime = isValidTimeInputValue(scheduleTime);
  const selectedTimePostId =
    channelTimePosts.find((timePost) => timePost.time === scheduleTime)?.id || null;
  const internalLinkScheduledAt =
    effectivePublishingMode === "schedule" && scheduleDate && hasValidScheduleTime
      ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
      : undefined;
  const editingIsSaving = Boolean(editing && savingPostIds.includes(editing.id));
  const editorIsSaving = editingIsSaving || Boolean(creatingPostId);
  const effectiveCaptionLengthMax =
    channelPublishingCapabilities?.captionLengthMax ?? 1024;
  const effectiveMessageLengthMax =
    channelPublishingCapabilities?.messageLengthMax ?? TELEGRAM_TEXT_MESSAGE_LIMIT;
  const checkInlineButtonPublishingAccess = async () => {
    try {
      const publishingCapabilities =
        await telegramChannelsApi.checkInlineButtonPublishingAccess(channelId);
      queryClient.setQueryData<TelegramChannel[]>(
        telegramChannelKeys.select({ canPostMessagesOnly: true }),
        (current) =>
          current?.map((item) =>
            item.id === channelId ? { ...item, publishingCapabilities } : item,
          ),
      );
      if (!publishingCapabilities.canPublishInlineButtons) {
        throw new Error(t("telegramPosts.errors.publishSourceUnavailable"));
      }
      pushToast(t("telegram.posts.editor.botAccessConfirmed"), "success");
      return true;
    } catch (error) {
      pushToast(
        localizedApiError(error, t("telegram.posts.editor.botAccessError")),
        "error",
      );
      return false;
    }
  };
  const hasLongImageText =
    imageUrls.length > 0 && text.length > effectiveCaptionLengthMax;
  const publishedLongImageTextMode =
    isPublished && hasLongImageText
      ? editing?.publishMode === "CAPTION_THEN_TEXT"
        ? "CAPTION_THEN_TEXT"
        : "IMAGES_THEN_TEXT"
      : null;
  const hasLongTextOnly =
    imageUrls.length === 0 && text.length > effectiveMessageLengthMax;
  const publishDisabledReason = busy
    ? t("telegram.posts.editor.validation.busy")
    : isReadOnlyTelegramPost
      ? t("telegram.posts.editor.validation.readOnly")
      : creatingPostId
        ? t("telegram.posts.editor.validation.saving")
        : iconPending
          ? t("telegram.posts.editor.validation.icon")
          : uploadingImages
            ? t("telegram.posts.editor.validation.images")
            : !title.trim()
              ? t("telegram.posts.editor.validation.title")
              : effectivePublishingMode !== "draft" &&
                  !text.trim() &&
                  !imageUrls.length
                ? t("telegram.posts.editor.validation.content")
                : effectivePublishingMode === "schedule" &&
                    (!scheduleDate || !scheduleTime)
                  ? t("telegram.posts.editor.validation.schedule")
                  : effectivePublishingMode === "schedule" && !hasValidScheduleTime
                    ? t("telegram.posts.editor.validation.time")
                    : "";
  const {
    query: postSearch,
    setQuery: setPostSearch,
    visiblePosts,
    visiblePendingPosts: visiblePendingPostSaves,
  } = useManagedPostSearch({
    posts: posts.data || [],
    pendingPosts: pendingPostSaves,
    status: statusTab,
    savingPostIds,
    isBrokenPublishedPost,
    groupTitle: (post) => effectivePostGroup(post)?.title,
    memberName: (post) => effectivePostMember(post)?.user.name,
  });
  const groupedVisiblePosts = useMemo(() => {
    const grouped = new Map<
      string,
      { group: EffectivePostGroup; posts: TelegramManagedPost[] }
    >();
    const ungrouped: TelegramManagedPost[] = [];

    visiblePosts.forEach((post) => {
      const group = effectivePostGroup(post);
      const groupId = effectivePostGroupId(post);
      if (!groupId || !group) {
        ungrouped.push(post);
        return;
      }
      const section = grouped.get(groupId);
      if (section) section.posts.push(post);
      else grouped.set(groupId, { group, posts: [post] });
    });

    return {
      groups: [...grouped.values()].map((section) => ({
        ...section,
        posts: [...section.posts].sort((left, right) => {
          const leftPosition = left.groupPosition ?? Number.MAX_SAFE_INTEGER;
          const rightPosition = right.groupPosition ?? Number.MAX_SAFE_INTEGER;
          if (leftPosition !== rightPosition) {
            return leftPosition - rightPosition;
          }
          return (
            new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
          );
        }),
      })),
      ungrouped,
    };
  }, [postGroupsById, telegramImportedSystemGroup, visiblePosts]);
  const calendarDays = useMemo(
    () => buildCalendarDays(calendarMonth),
    [calendarMonth],
  );
  const calendarItemsByDay = useMemo(() => {
    const grouped = new Map<string, TelegramManagedPostCalendarResult["items"]>();
    for (const item of calendarData.data?.items || []) {
      const key = toLocalDateKey(
        item.status === "SCHEDULED"
          ? item.scheduledAt || item.publishedAt || new Date()
          : item.publishedAt || item.scheduledAt || new Date(),
      );
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }
    for (const [key, items] of grouped) {
      grouped.set(
        key,
        [...items].sort((left, right) => {
          const leftDate = new Date(
            left.status === "SCHEDULED"
              ? left.scheduledAt || 0
              : left.publishedAt || 0,
          ).getTime();
          const rightDate = new Date(
            right.status === "SCHEDULED"
              ? right.scheduledAt || 0
              : right.publishedAt || 0,
          ).getTime();
          return leftDate - rightDate;
        }),
      );
    }
    return grouped;
  }, [calendarData.data]);
  const selectedCalendarItems = calendarItemsByDay.get(selectedCalendarDate) || [];
  const adCalendarItemsByDay = useMemo(() => {
    const grouped = new Map<
      string,
      Array<NonNullable<typeof adCalendarOverlay.data>["slots"][number]>
    >();
    for (const item of adCalendarOverlay.data?.slots || []) {
      if (item.state === "AVAILABLE") continue;
      const key = toLocalDateKey(item.scheduledAt);
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }
    for (const [key, items] of grouped) {
      grouped.set(
        key,
        [...items].sort((left, right) =>
          left.scheduledAt.localeCompare(right.scheduledAt),
        ),
      );
    }
    return grouped;
  }, [adCalendarOverlay.data]);
  const selectedAdCalendarItems =
    adCalendarItemsByDay.get(selectedCalendarDate) || [];
  const calendarPresetScheduleSlots = useMemo(
    () =>
      buildCalendarDayScheduleSlots({
        dateKey: selectedCalendarDate,
        timePosts: channelTimePosts,
        items: selectedCalendarItems,
      }),
    [channelTimePosts, selectedCalendarDate, selectedCalendarItems],
  );
  const calendarScheduleSlots = calendarPresetScheduleSlots;
  const calendarPresetSlotByTime = useMemo(
    () =>
      new Map(calendarPresetScheduleSlots.map((slot) => [slot.time, slot] as const)),
    [calendarPresetScheduleSlots],
  );
  const plannerGroupOptions = useMemo(
    () =>
      (postGroups.data || []).map((group) => ({
        value: group.id,
        label: telegramPostGroupTitle(group, t),
        iconEmoji:
          group.iconPresentation?.type === "unicode"
            ? group.iconPresentation.value
            : undefined,
        iconUrl:
          group.iconPresentation?.type === "image"
            ? group.iconPresentation.url
            : undefined,
        iconFallback: telegramPostGroupTitle(group, t),
      })),
    [postGroups.data, t],
  );
  const plannerTimePostOptions = useMemo(
    () =>
      channelTimePosts.map((slot) => ({
        value: slot.id,
        label: `${slot.time} · ${slot.title}`,
        iconEmoji:
          slot.iconPresentation?.type === "unicode"
            ? slot.iconPresentation.value
            : undefined,
        iconUrl:
          slot.iconPresentation?.type === "image"
            ? slot.iconPresentation.url
            : undefined,
        iconFallback: slot.title,
      })),
    [channelTimePosts],
  );
  const plannerTimePostsById = useMemo(
    () => new Map(channelTimePosts.map((slot) => [slot.id, slot])),
    [channelTimePosts],
  );
  const plannerTimePostsByTime = useMemo(
    () => new Map(channelTimePosts.map((slot) => [slot.time, slot])),
    [channelTimePosts],
  );
  const plannerSlotsByFormatId = useMemo(() => {
    const grouped = new Map<string, TelegramPostPlannerSlot[]>();
    for (const slot of plannerSlots.data || []) {
      if (!slot.formatId) continue;
      const current = grouped.get(slot.formatId) || [];
      current.push(slot);
      grouped.set(slot.formatId, current);
    }
    for (const slots of grouped.values()) {
      slots.sort(
        (left, right) =>
          left.position - right.position || left.time.localeCompare(right.time),
      );
    }
    return grouped;
  }, [plannerSlots.data]);
  const plannerSlotGroupsByFormatId = useMemo(() => {
    const groupedByFormat = new Map<string, PlannerSlotDisplayGroup[]>();
    for (const [formatId, slots] of plannerSlotsByFormatId) {
      const grouped = new Map<string, PlannerSlotDisplayGroup>();
      for (const slot of slots) {
        const key = plannerSlotDisplayGroupKey(slot);
        const timePostId = plannerTimePostsByTime.get(slot.time)?.id ?? "";
        const current =
          grouped.get(key) ??
          ({
            id: slot.id,
            slots: [],
            timePostIds: [],
            groupIds: slot.postGroupIds,
          } satisfies PlannerSlotDisplayGroup);
        current.slots.push(slot);
        if (timePostId && !current.timePostIds.includes(timePostId)) {
          current.timePostIds.push(timePostId);
        }
        grouped.set(key, current);
      }
      groupedByFormat.set(formatId, Array.from(grouped.values()));
    }
    return groupedByFormat;
  }, [plannerSlotsByFormatId, plannerTimePostsByTime]);
  const plannerFormatsWithWeights = useMemo(() => {
    const formats = plannerFormats.data || [];
    const normalizedWeights = normalizePlannerFormatWeights(
      formats.map((format) => format.id),
      plannerFormatWeights,
    );
    return formats.map((format) => ({
      format,
      weight: normalizedWeights[format.id] ?? 0,
      slots: plannerSlotsByFormatId.get(format.id) || [],
    }));
  }, [plannerFormatWeights, plannerFormats.data, plannerSlotsByFormatId]);
  const hasEnabledPlannerFormatWeight = plannerFormatsWithWeights.some(
    (item) => item.weight > 0,
  );
  const hasPlannerFormatSlots = plannerFormatsWithWeights.some(
    (item) => item.slots.length > 0,
  );
  const canUsePlannerFormatSlots =
    hasPlannerFormatSlots && hasEnabledPlannerFormatWeight;
  const calendarSchedulablePosts = useMemo(() => {
    const managedPosts = posts.data || [];
    return getCalendarSchedulablePosts(managedPosts).filter((post) =>
      canScheduleManagedPost(post, managedPosts, channelTelegramChatId),
    );
  }, [channelTelegramChatId, posts.data]);
  const calendarFilteredSchedulablePosts = useMemo(() => {
    const search = calendarPostSearch.trim().toLocaleLowerCase();
    if (!search) return calendarSchedulablePosts;
    return calendarSchedulablePosts.filter((post) => {
      const title = post.title.toLocaleLowerCase();
      const groupTitle = effectivePostGroup(post)?.title?.toLocaleLowerCase() || "";
      return title.includes(search) || groupTitle.includes(search);
    });
  }, [
    calendarPostSearch,
    calendarSchedulablePosts,
    postGroupsById,
    telegramImportedSystemGroup,
  ]);
  const calendarSchedulablePostsById = useMemo(
    () => new Map(calendarSchedulablePosts.map((post) => [post.id, post])),
    [calendarSchedulablePosts],
  );
  const calendarGroupedSchedulablePosts = useMemo(() => {
    const grouped = new Map<
      string,
      { group: EffectivePostGroup; posts: TelegramManagedPost[] }
    >();
    const ungrouped: TelegramManagedPost[] = [];
    for (const post of calendarFilteredSchedulablePosts) {
      const group = effectivePostGroup(post);
      const groupId = effectivePostGroupId(post);
      if (!groupId || !group) {
        ungrouped.push(post);
        continue;
      }
      const current = grouped.get(groupId);
      if (current) {
        current.posts.push(post);
      } else {
        grouped.set(groupId, { group, posts: [post] });
      }
    }
    return { groups: [...grouped.values()], ungrouped };
  }, [calendarFilteredSchedulablePosts, postGroupsById, telegramImportedSystemGroup]);
  const calendarBatchSelectedPosts = useMemo(
    () =>
      calendarBatchSelectedPostIds
        .map((postId) => calendarSchedulablePostsById.get(postId))
        .filter((post): post is TelegramManagedPost => Boolean(post)),
    [calendarBatchSelectedPostIds, calendarSchedulablePostsById],
  );
  const calendarBatchPlan = useMemo(() => {
    const assignments: ScheduleManagedPostsBatchItem[] = [];
    const invalidPostIds: string[] = [];
    const duplicatePostIds: string[] = [];
    const usedTimes = new Map<string, string>();
    const selectedSlotByTime = new Map(
      calendarScheduleSlots.map((slot) => [slot.time, slot]),
    );

    for (const postId of calendarBatchSelectedPostIds) {
      const choice = calendarBatchTimeChoiceByPostId[postId] || "";
      if (!choice) {
        invalidPostIds.push(postId);
        continue;
      }
      let resolvedTime = "";
      if (choice.startsWith("slot:")) {
        resolvedTime = choice.slice(5);
        const slot = selectedSlotByTime.get(resolvedTime);
        if (!slot || slot.state !== "available") {
          invalidPostIds.push(postId);
          continue;
        }
      } else if (choice === "custom") {
        const customTime = calendarBatchCustomTimeByPostId[postId] || "";
        if (!isValidTimeInputValue(customTime)) {
          invalidPostIds.push(postId);
          continue;
        }
        const candidate = new Date(`${selectedCalendarDate}T${customTime}:00`);
        if (Number.isNaN(candidate.getTime()) || candidate.getTime() <= Date.now()) {
          invalidPostIds.push(postId);
          continue;
        }
        const slot = selectedSlotByTime.get(customTime);
        if (slot?.state === "occupied" || slot?.state === "past") {
          invalidPostIds.push(postId);
          continue;
        }
        resolvedTime = customTime;
      } else {
        invalidPostIds.push(postId);
        continue;
      }
      if (usedTimes.has(resolvedTime)) {
        duplicatePostIds.push(postId, usedTimes.get(resolvedTime)!);
        continue;
      }
      usedTimes.set(resolvedTime, postId);
      assignments.push({
        postId,
        scheduledAt: new Date(
          `${selectedCalendarDate}T${resolvedTime}:00`,
        ).toISOString(),
      });
    }

    const chronologicalAssignments = sortScheduleManagedPostAssignments(assignments);
    return {
      assignments: chronologicalAssignments,
      assignedPostIds: chronologicalAssignments.map((item) => item.postId),
      overflowPostIds: [],
      invalidPostIds: [...new Set(invalidPostIds)],
      duplicatePostIds: [...new Set(duplicatePostIds)],
    };
  }, [
    calendarBatchCustomTimeByPostId,
    calendarBatchSelectedPostIds,
    calendarBatchTimeChoiceByPostId,
    calendarScheduleSlots,
    selectedCalendarDate,
  ]);
  const availableCalendarScheduleSlots = useMemo(
    () => calendarScheduleSlots.filter((slot) => slot.state === "available"),
    [calendarScheduleSlots],
  );
  const selectedCalendarDateLabel = formatDateWithWeekday(
    `${selectedCalendarDate}T12:00:00`,
    locale,
  );
  useEffect(() => {
    setCalendarBatchSelectedPostIds((current) =>
      current.filter((postId) => calendarSchedulablePostsById.has(postId)),
    );
  }, [calendarSchedulablePostsById]);
  useEffect(() => {
    setCalendarBatchTimeChoiceByPostId({});
    setCalendarBatchCustomTimeByPostId({});
  }, [selectedCalendarDate]);
  const groupedPendingPostSaves = useMemo(() => {
    const grouped = new Map<string, PendingPostSave[]>();
    const ungrouped: PendingPostSave[] = [];

    visiblePendingPostSaves.forEach((post) => {
      if (!post.groupId) {
        ungrouped.push(post);
        return;
      }
      grouped.set(post.groupId, [...(grouped.get(post.groupId) ?? []), post]);
    });

    return { grouped, ungrouped };
  }, [visiblePendingPostSaves]);
  const canonicalSidebarKeys = useMemo(
    () =>
      [
        ...(postGroups.data || []).map((group, index) => ({
          key: `group:${group.id}`,
          position: group.sidebarPosition,
          fallback: index,
        })),
        ...(posts.data || [])
          .filter((post) => !effectivePostGroupId(post))
          .map((post, index) => ({
            key: `post:${post.id}`,
            position: post.sidebarPosition,
            fallback: (postGroups.data?.length || 0) + index,
          })),
      ]
        .sort(
          (left, right) =>
            (left.position ?? Number.MAX_SAFE_INTEGER) -
              (right.position ?? Number.MAX_SAFE_INTEGER) ||
            left.fallback - right.fallback,
        )
        .map((item) => item.key),
    [postGroups.data, postGroupsById, posts.data, telegramImportedSystemGroup],
  );
  const sidebarSections = useMemo<PostSidebarSection[]>(() => {
    const groupsById = new Map(
      (postGroups.data || []).map((group) => [group.id, group]),
    );
    const visibleGroupsById = new Map(
      groupedVisiblePosts.groups.map((section) => [section.group.id, section]),
    );
    const groupIds = [
      ...new Set([
        ...groupedVisiblePosts.groups.map((section) => section.group.id),
        ...groupedPendingPostSaves.grouped.keys(),
      ]),
    ];
    const groupSections: PostSidebarSection[] = groupIds.flatMap((groupId) => {
      const visibleGroup = visibleGroupsById.get(groupId);
      const group = visibleGroup?.group ?? groupsById.get(groupId);
      if (!group) return [];
      return [
        {
          key: `group:${group.id}`,
          group,
          posts: visibleGroup?.posts ?? [],
          pendingPosts: groupedPendingPostSaves.grouped.get(group.id) ?? [],
        },
      ];
    });
    const sections: PostSidebarSection[] = [
      ...groupSections,
      ...groupedVisiblePosts.ungrouped.map((post) => ({
        key: `post:${post.id}`,
        group: null,
        posts: [post],
        pendingPosts: [],
      })),
    ];
    const canonicalIndex = new Map(
      canonicalSidebarKeys.map((key, index) => [key, index]),
    );
    return sections.sort(
      (left, right) =>
        (canonicalIndex.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
        (canonicalIndex.get(right.key) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [
    canonicalSidebarKeys,
    groupedPendingPostSaves.grouped,
    groupedVisiblePosts,
    postGroups.data,
  ]);
  const orderedSidebarSections = useMemo(() => {
    if (
      sidebarOrderKeys.length !== sidebarSections.length ||
      sidebarOrderKeys.some(
        (key) => !sidebarSections.some((section) => section.key === key),
      )
    ) {
      return sidebarSections;
    }
    const byKey = new Map(sidebarSections.map((section) => [section.key, section]));
    return sidebarOrderKeys
      .map((key) => byKey.get(key))
      .filter((section): section is PostSidebarSection => Boolean(section));
  }, [sidebarOrderKeys, sidebarSections]);
  const channelPostIds = (posts.data || []).map((post) => post.id);
  const selectedPosts = selectedPostIds
    .map((id) => posts.data?.find((post) => post.id === id))
    .filter((post): post is TelegramManagedPost => Boolean(post));
  const allChannelPostsSelected =
    channelPostIds.length > 0 &&
    channelPostIds.every((id) => selectedPostIds.includes(id));
  const allGroupIds = [
    ...new Set([
      ...(postGroups.data || []).map((group) => group.id),
      ...groupedVisiblePosts.groups.map(({ group }) => group.id),
    ]),
  ];
  const collapsedGroupIds = collapsedGroupIdsPreference ?? allGroupIds;
  const changeStatusTab = (next: PostStatusTab) => {
    setStatusTab(next);
    window.localStorage.setItem(`telegram-posts-status:${channelId}`, next);
  };

  const changeWorkspaceView = (next: "posts" | "groups") => {
    setWorkspaceView(next);
    onWorkspaceViewChange(next);
    window.localStorage.setItem(workspaceViewPreferenceKey(channelId), next);
    router.replace(
      buildTelegramPostsUrl({
        channelId,
        groupId: next === "groups" ? initialGroupId || null : null,
        postView: next === "groups" ? "groups" : postView,
      }),
    );
  };

  const changePostView = (next: PostViewMode) => {
    setPostView(next);
    router.replace(
      buildTelegramPostsUrl({
        channelId,
        postId: editing?.id || initialPostId || null,
        postView: next,
      }),
    );
  };

  const invalidatePlannerCalendar = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.managedLists(channelId),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.managedCalendar(channelId),
      }),
      queryClient.invalidateQueries({
        queryKey: ["telegram-ad-availability", "telegram-posts-overlay", channelId],
      }),
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.postGroups(channelId),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.plannerFormats(channelId),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.plannerSlots(channelId),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.linkTargets(channelId),
      }),
    ]);
  };

  const runPlannerMutation = async (
    action: () => Promise<unknown>,
    successMessage: string,
  ) => {
    if (autoPlannerBusy) return;
    setAutoPlannerBusy(true);
    try {
      await action();
      await invalidatePlannerCalendar();
      pushToast(successMessage, "success");
    } catch (error) {
      pushToast(
        localizedApiError(error, t("telegram.posts.calendar.error.updatePlanner")),
        "error",
      );
    } finally {
      setAutoPlannerBusy(false);
    }
  };

  const createPlannerFormat = async () => {
    const name = newPlannerFormatName.trim();
    if (!name || autoPlannerBusy) return;
    setAutoPlannerBusy(true);
    try {
      await telegramChannelsApi.createPostPlannerFormat(channelId, {
        name,
        icon: newPlannerFormatIcon.trim() || null,
        position: plannerFormats.data?.length ?? 0,
      });
      setNewPlannerFormatName("");
      setNewPlannerFormatIcon("");
      await invalidatePlannerCalendar();
      pushToast(t("telegram.posts.calendar.formatCreated"), "success");
    } catch (error) {
      pushToast(
        localizedApiError(error, t("telegram.posts.calendar.error.createFormat")),
        "error",
      );
    } finally {
      setAutoPlannerBusy(false);
    }
  };

  const createPlannerSlot = async (formatId: string) => {
    const draft = plannerSlotDraftsByFormatId[formatId];
    const timePosts = (draft?.timePostIds || [])
      .map((timePostId) => plannerTimePostsById.get(timePostId))
      .filter((timePost): timePost is TelegramChannelTimePost => Boolean(timePost));
    if (!timePosts.length || autoPlannerBusy) return;
    setAutoPlannerBusy(true);
    try {
      const basePosition = plannerSlotsByFormatId.get(formatId)?.length ?? 0;
      const operation = startOperation({
        id: `planner-slots-create:${channelId}:${formatId}`,
        title: t("telegram.posts.calendar.createSlots"),
        message: t("telegram.posts.calendar.starting"),
        current: 0,
        total: timePosts.length,
      });
      let successful = 0;
      let failed = 0;
      const result = await telegramChannelsApi.mutatePostPlannerSlotsWithProgress(
        channelId,
        timePosts.map((timePost, index) => ({
          action: "CREATE" as const,
          data: {
            formatId,
            postGroupIds: draft?.groupIds || [],
            weekday: 1,
            time: timePost.time,
            position: basePosition + index,
          },
        })),
        (item, current, total) => {
          if (item.success) successful += 1;
          else failed += 1;
          operation.update({
            message:
              (locale === "en" ? item.message : null) ||
              t("telegram.posts.calendar.updating"),
            current,
            total,
            progressSummary: { successful, failed },
          });
        },
      );
      const completion = {
        message: t("telegram.posts.calendar.result", {
          successful: result.successCount,
          failed: result.failedCount,
        }),
      };
      if (result.failedCount) operation.fail(completion);
      else operation.succeed(completion);
      setPlannerSlotDraftsByFormatId((current) => ({
        ...current,
        [formatId]: { timePostIds: [], groupIds: [] },
      }));
      await invalidatePlannerCalendar();
      pushToast(
        timePosts.length === 1
          ? t("telegram.posts.calendar.slotCreated")
          : t("telegram.posts.calendar.slotsCreated", {
              count: timePosts.length,
            }),
        result.failedCount ? "info" : "success",
      );
    } catch (error) {
      pushToast(
        localizedApiError(error, t("telegram.posts.calendar.error.createSlot")),
        "error",
      );
    } finally {
      setAutoPlannerBusy(false);
    }
  };

  const updatePlannerSlotGroupEditDraft = (
    slotGroup: PlannerSlotDisplayGroup,
    patch: Partial<PlannerSlotEditDraft>,
  ) => {
    setPlannerSlotEditDraftsById((current) => {
      const currentDraft = current[slotGroup.id] ?? {
        timePostIds: slotGroup.timePostIds,
        groupIds: slotGroup.groupIds,
      };
      return {
        ...current,
        [slotGroup.id]: {
          ...currentDraft,
          ...patch,
        },
      };
    });
  };

  const resetPlannerSlotEditDraft = (slotId: string) => {
    setPlannerSlotEditDraftsById((current) => {
      const next = { ...current };
      delete next[slotId];
      return next;
    });
  };

  const savePlannerSlotGroupEditDraft = async (
    slotGroup: PlannerSlotDisplayGroup,
  ) => {
    const draft = plannerSlotEditDraftsById[slotGroup.id] ?? {
      timePostIds: slotGroup.timePostIds,
      groupIds: slotGroup.groupIds,
    };
    const timePosts = draft.timePostIds
      .map((timePostId) => plannerTimePostsById.get(timePostId))
      .filter((timePost): timePost is TelegramChannelTimePost => Boolean(timePost));
    if (!timePosts.length) {
      pushToast(t("telegram.posts.calendar.timeRequired"), "error");
      return;
    }
    await runPlannerMutation(
      async () => {
        const [templateSlot] = slotGroup.slots;
        if (!templateSlot) {
          throw new Error(t("telegram.posts.calendar.error.slotMissing"));
        }
        const existingSlots = slotGroup.slots;
        const slotsToUpdate = existingSlots.slice(0, timePosts.length);
        const slotsToDelete = existingSlots.slice(timePosts.length);
        const timePostsToCreate = timePosts.slice(existingSlots.length);
        const formatSlots = templateSlot.formatId
          ? plannerSlotsByFormatId.get(templateSlot.formatId) || []
          : [];
        const basePosition = formatSlots.length;

        const mutations = [
          ...slotsToUpdate.map((existingSlot, index) => ({
            action: "UPDATE" as const,
            slotId: existingSlot.id,
            data: {
              postGroupIds: draft.groupIds,
              time: timePosts[index]?.time ?? existingSlot.time,
            },
          })),
          ...timePostsToCreate.map((timePost, index) => ({
            action: "CREATE" as const,
            data: {
              formatId: templateSlot.formatId,
              postGroupIds: draft.groupIds,
              weekday: templateSlot.weekday,
              time: timePost.time,
              timezone: templateSlot.timezone,
              position: basePosition + index,
              isActive: templateSlot.isActive,
            },
          })),
          ...slotsToDelete.map((existingSlot) => ({
            action: "DELETE" as const,
            slotId: existingSlot.id,
          })),
        ];
        let successful = 0;
        let failed = 0;
        const operation = startOperation({
          id: `planner-slots-save:${channelId}:${slotGroup.id}`,
          title: t("telegram.posts.calendar.updateSlots"),
          message: t("telegram.posts.calendar.starting"),
          current: 0,
          total: mutations.length,
        });
        const result = await telegramChannelsApi.mutatePostPlannerSlotsWithProgress(
          channelId,
          mutations,
          (item, current, total) => {
            if (item.success) successful += 1;
            else failed += 1;
            operation.update({
              message:
                (locale === "en" ? item.message : null) ||
                t("telegram.posts.calendar.updating"),
              current,
              total,
              progressSummary: { successful, failed },
            });
          },
        );
        const completion = {
          message: t("telegram.posts.calendar.result", {
            successful: result.successCount,
            failed: result.failedCount,
          }),
        };
        if (result.failedCount) operation.fail(completion);
        else operation.succeed(completion);
        if (result.failedCount) throw new Error(completion.message);
        resetPlannerSlotEditDraft(slotGroup.id);
        setEditingPlannerSlotGroupIds((current) =>
          current.filter((id) => id !== slotGroup.id),
        );
      },
      timePosts.length === 1
        ? t("telegram.posts.calendar.slotUpdated")
        : t("telegram.posts.calendar.slotsSaved", { count: timePosts.length }),
    );
  };

  const updatePlannerFormatDraft = (
    format: TelegramPostPlannerFormat,
    patch: Partial<PlannerFormatDraft>,
  ) => {
    setPlannerFormatDraftsById((current) => {
      const currentDraft = current[format.id] ?? {
        name: format.name,
        icon: format.icon ?? "",
      };
      return {
        ...current,
        [format.id]: {
          ...currentDraft,
          ...patch,
        },
      };
    });
  };

  const savePlannerFormatDraft = async (format: TelegramPostPlannerFormat) => {
    const draft = plannerFormatDraftsById[format.id];
    if (!draft || autoPlannerBusy) return;
    const name = draft.name.trim();
    if (!name) {
      pushToast(t("telegram.posts.calendar.nameRequired"), "error");
      return;
    }
    await runPlannerMutation(async () => {
      await telegramChannelsApi.updatePostPlannerFormat(channelId, format.id, {
        name,
        icon: draft.icon.trim() || null,
      });
      setPlannerFormatDraftsById((current) => {
        const { [format.id]: _removed, ...rest } = current;
        return rest;
      });
      setEditingPlannerFormatIds((current) =>
        current.filter((id) => id !== format.id),
      );
    }, t("telegram.posts.calendar.formatUpdated"));
  };

  const autoPlannerRange = () => {
    const from = autoPlannerFrom;
    const to =
      autoPlannerDays > 0
        ? toLocalDateKey(addDays(new Date(`${from}T00:00:00`), autoPlannerDays - 1))
        : autoPlannerTo;
    return { from, to };
  };

  const autoPlannerPreviewPayload = () => {
    const { from, to } = autoPlannerRange();
    const formatWeights = Object.fromEntries(
      plannerFormatsWithWeights.map(({ format, weight }) => [format.id, weight]),
    );
    return {
      from,
      to,
      formatIds: plannerFormatsWithWeights
        .filter((item) => item.weight > 0)
        .map((item) => item.format.id),
      formatWeights,
      limit: 50,
    };
  };

  const fillPlannerRange = async () => {
    if (autoPlannerBusy) return;
    setAutoPlannerBusy(true);
    try {
      const result = await telegramChannelsApi.previewPostPlanner(
        channelId,
        autoPlannerPreviewPayload(),
      );
      setAutoPlannerPreview(result);
      setAutoPlannerPreviewSource("system");
      setAutoPlannerRerollOffsetsByDate({});
      pushToast(
        result.summary.plannedPosts
          ? t("telegram.posts.calendar.previewReady", {
              count: result.summary.plannedPosts,
            })
          : result.summary.availableSlots
            ? t("telegram.posts.calendar.noDraftMatches", {
                count: result.summary.availableSlots,
              })
            : t("telegram.posts.calendar.noSlots"),
        result.summary.plannedPosts ? "success" : "info",
      );
    } catch (error) {
      pushToast(
        localizedApiError(error, t("telegram.posts.calendar.error.preview")),
        "error",
      );
    } finally {
      setAutoPlannerBusy(false);
    }
  };

  const rerollAutoPlannerDay = async (date: string) => {
    if (!autoPlannerPreview || autoPlannerBusy) return;
    const rerollOffset = (autoPlannerRerollOffsetsByDate[date] ?? 0) + 1;
    const otherAssignments = autoPlannerPreview.assignments.filter(
      (assignment) => assignment.date !== date,
    );
    setAutoPlannerBusy(true);
    setAutoPlannerRerollingDate(date);
    try {
      const result = await telegramChannelsApi.previewPostPlanner(channelId, {
        ...autoPlannerPreviewPayload(),
        from: date,
        to: date,
        rerollOffset,
        excludePostIds: otherAssignments.map((assignment) => assignment.postId),
      });
      const assignments = [...otherAssignments, ...result.assignments].sort(
        (left, right) =>
          new Date(left.scheduledAt).getTime() -
          new Date(right.scheduledAt).getTime(),
      );
      setAutoPlannerPreview((current) =>
        current
          ? {
              ...current,
              assignments,
              summary: {
                ...current.summary,
                plannedPosts: assignments.length,
                unfilledSlots: Math.max(
                  0,
                  current.summary.availableSlots - assignments.length,
                ),
              },
            }
          : current,
      );
      setAutoPlannerRerollOffsetsByDate((current) => ({
        ...current,
        [date]: rerollOffset,
      }));
    } catch (error) {
      pushToast(
        localizedApiError(error, t("telegram.posts.calendar.error.reroll")),
        "error",
      );
    } finally {
      setAutoPlannerRerollingDate(null);
      setAutoPlannerBusy(false);
    }
  };

  const updateEditedPlannerPreview = (
    preview: TelegramPostPlannerPreviewResult | null,
  ) => {
    setAutoPlannerPreview(preview);
    if (autoPlannerPreviewSource === "import") {
      setCalendarPlanImportContent(
        preview ? serializeCalendarPlanImport(preview) : "",
      );
    }
  };

  const scheduleAutoPlannerPreview = async () => {
    if (!autoPlannerPreview?.assignments.length || autoPlannerBusy) return;
    const assignments = autoPlannerPreview.assignments;
    const uniqueTimes = new Set(
      assignments.map((assignment) => assignment.scheduledAt),
    );
    if (uniqueTimes.size !== assignments.length) {
      pushToast(t("telegram.posts.calendar.duplicatePreview"), "error");
      return;
    }
    const progressId = `auto-planner:${channelId}:${autoPlannerPreview.from}:${autoPlannerPreview.to}`;
    setAutoPlannerBusy(true);
    setProgress({
      id: progressId,
      title: t("telegram.posts.calendar.schedulePlan"),
      current: 0,
      total: assignments.length,
      message: t("telegram.posts.calendar.schedulingPreview", {
        count: assignments.length,
      }),
      iconUrl: channelPhotoUrl || undefined,
      successCount: 0,
      failedCount: 0,
    });
    try {
      let successful = 0;
      let failed = 0;
      const result = await telegramChannelsApi.scheduleManagedPostsBatch(
        channelId,
        {
          items: assignments.map((assignment) => ({
            postId: assignment.postId,
            scheduledAt: assignment.scheduledAt,
          })),
        },
        (item, current, total) => {
          if (item.success) successful += 1;
          else failed += 1;
          setProgress({
            id: progressId,
            title: t("telegram.posts.calendar.schedulePlan"),
            current,
            total,
            message:
              (locale === "en" ? item.message : null) ||
              t("telegram.posts.calendar.schedulingPreviewPosts"),
            iconUrl: channelPhotoUrl || undefined,
            successCount: successful,
            failedCount: failed,
          });
        },
      );
      setProgress({
        id: progressId,
        title: t("telegram.posts.calendar.schedulePlan"),
        current: result.total,
        total: result.total,
        message: t("telegram.posts.calendar.finished"),
        completed: true,
        successCount: result.successCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        iconUrl: channelPhotoUrl || undefined,
      });
      window.setTimeout(() => clearProgress(progressId), 2800);
      const failedPostIds = new Set(
        result.results.filter((item) => !item.success).map((item) => item.postId),
      );
      if (failedPostIds.size) {
        const remaining = assignments.filter((assignment) =>
          failedPostIds.has(assignment.postId),
        );
        updateEditedPlannerPreview({
          ...autoPlannerPreview,
          assignments: remaining,
          summary: {
            ...autoPlannerPreview.summary,
            plannedPosts: remaining.length,
            unfilledSlots: Math.max(
              0,
              autoPlannerPreview.summary.availableSlots - remaining.length,
            ),
          },
        });
      } else {
        updateEditedPlannerPreview(null);
      }
      await invalidatePlannerCalendar();
      pushToast(
        result.failedCount
          ? t("telegram.posts.calendar.scheduleResult", {
              successful: result.successCount,
              failed: result.failedCount,
            })
          : t("telegram.posts.calendar.scheduledCount", {
              count: result.successCount,
            }),
        result.failedCount ? "info" : "success",
      );
    } catch (error) {
      clearProgress(progressId);
      pushToast(
        localizedApiError(error, t("telegram.posts.calendar.error.schedulePlan")),
        "error",
      );
    } finally {
      setAutoPlannerBusy(false);
    }
  };

  const removeAutoPlannerAssignment = (postId: string, scheduledAt: string) => {
    if (!autoPlannerPreview) return;
    const assignments = autoPlannerPreview.assignments.filter(
      (assignment) =>
        assignment.postId !== postId || assignment.scheduledAt !== scheduledAt,
    );
    updateEditedPlannerPreview({
      ...autoPlannerPreview,
      assignments,
      summary: {
        ...autoPlannerPreview.summary,
        plannedPosts: assignments.length,
        unfilledSlots: Math.max(
          0,
          autoPlannerPreview.summary.availableSlots - assignments.length,
        ),
      },
    });
  };

  const replaceAutoPlannerAssignmentPost = (
    currentPostId: string,
    scheduledAt: string,
    nextPostId: string,
  ) => {
    const nextPost = calendarSchedulablePosts.find((post) => post.id === nextPostId);
    if (!nextPost) return;
    if (
      autoPlannerPreview?.assignments.some(
        (assignment) =>
          assignment.postId === nextPostId && assignment.postId !== currentPostId,
      )
    ) {
      pushToast(t("telegram.posts.calendar.alreadyUsed"), "error");
      return;
    }
    if (!autoPlannerPreview) return;
    updateEditedPlannerPreview({
      ...autoPlannerPreview,
      assignments: autoPlannerPreview.assignments.map((assignment) =>
        assignment.postId === currentPostId && assignment.scheduledAt === scheduledAt
          ? {
              ...assignment,
              postId: nextPost.id,
              title: nextPost.title,
              groupId: effectivePostGroupId(nextPost),
              provenance: {
                ...assignment.provenance,
                groupId: effectivePostGroupId(nextPost),
              },
            }
          : assignment,
      ),
    });
  };

  const toggleCalendarBatchPostSelection = (postId: string) => {
    setCalendarBatchSelectedPostIds((current) => {
      if (current.includes(postId)) {
        setCalendarBatchTimeChoiceByPostId((choices) => {
          const next = { ...choices };
          delete next[postId];
          return next;
        });
        setCalendarBatchCustomTimeByPostId((times) => {
          const next = { ...times };
          delete next[postId];
          return next;
        });
        return current.filter((value) => value !== postId);
      }
      return [...current, postId];
    });
  };

  const selectCalendarBatchFit = (
    formatId: string | null = null,
    rerollOffset = 0,
  ) => {
    const visiblePostIds = new Set(
      calendarFilteredSchedulablePosts.map((post) => post.id),
    );
    const weightedFormatSlots = () => {
      const enabledFormats = plannerFormatsWithWeights.filter(
        (item) => item.weight > 0 && item.slots.length,
      );
      if (!enabledFormats.length) return [];
      const weightedQueue = enabledFormats.flatMap((item) =>
        Array.from({ length: Math.max(1, Math.round(item.weight / 10)) }, () => item),
      );
      const usedSlotIds = new Set<string>();
      const sequence: TelegramPostPlannerSlot[] = [];
      let guard = 0;
      while (
        usedSlotIds.size <
          enabledFormats.reduce((total, item) => total + item.slots.length, 0) &&
        guard < 500
      ) {
        const item = weightedQueue[guard % weightedQueue.length];
        const slot = item.slots.find((candidate) => !usedSlotIds.has(candidate.id));
        if (slot) {
          usedSlotIds.add(slot.id);
          sequence.push(slot);
        }
        guard += 1;
      }
      return sequence;
    };
    const sourceSlots = formatId
      ? plannerSlotsByFormatId.get(formatId) || []
      : weightedFormatSlots();
    const fitSlots = sourceSlots.length
      ? sourceSlots.map((slot) => ({
          id: slot.id,
          time: slot.time,
          postGroupIds: slot.postGroupIds,
        }))
      : availableCalendarScheduleSlots.map((slot) => ({
          id: slot.id,
          time: slot.time,
          postGroupIds: [] as string[],
        }));
    const remainingPosts = shuffleCalendarSchedulablePosts(
      calendarSchedulablePosts.filter((post) => visiblePostIds.has(post.id)),
    );
    const selectedIds: string[] = [];
    const timeChoices: Record<string, string> = {};
    const customTimes: Record<string, string> = {};
    const availableTimes = new Set(
      availableCalendarScheduleSlots.map((slot) => slot.time),
    );
    for (const slot of fitSlots) {
      const postIndex = remainingPosts.findIndex((post) => {
        const groupId = effectivePostGroupId(post);
        return (
          !slot.postGroupIds.length ||
          (groupId != null && slot.postGroupIds.includes(groupId))
        );
      });
      if (postIndex < 0) continue;
      const [post] = remainingPosts.splice(postIndex, 1);
      selectedIds.push(post.id);
      if (availableTimes.has(slot.time)) {
        timeChoices[post.id] = `slot:${slot.time}`;
      } else {
        timeChoices[post.id] = "custom";
        customTimes[post.id] = slot.time;
      }
    }
    setCalendarBatchSelectedPostIds(selectedIds);
    setCalendarBatchTimeChoiceByPostId(timeChoices);
    setCalendarBatchCustomTimeByPostId(customTimes);
    setCalendarPlannerFitFormatId(formatId);
    setCalendarPlannerFitRerollOffset(rerollOffset);
  };

  const clearCalendarBatchSelection = () => {
    setCalendarBatchSelectedPostIds([]);
    setCalendarBatchTimeChoiceByPostId({});
    setCalendarBatchCustomTimeByPostId({});
    setCalendarPlannerFitFormatId(null);
    setCalendarPlannerFitRerollOffset(0);
  };

  const scheduleCalendarBatch = async () => {
    const assignments = calendarBatchPlan.assignments;
    if (!assignments.length || calendarBatchBusy) return;
    const progressId = `calendar-batch:${channelId}:${selectedCalendarDate}`;
    setCalendarBatchBusy(true);
    setProgress({
      id: progressId,
      title: t("telegram.posts.calendar.scheduleDay"),
      current: 0,
      total: assignments.length,
      message: t("telegram.posts.calendar.schedulingDay", {
        count: assignments.length,
        date: selectedCalendarDateLabel,
      }),
      iconUrl: channelPhotoUrl || undefined,
    });
    try {
      const result = await telegramChannelsApi.scheduleManagedPostsBatch(
        channelId,
        { items: assignments },
        (item, current, total) => {
          setProgress({
            id: progressId,
            title: t("telegram.posts.calendar.scheduleDay"),
            current,
            total,
            message:
              (locale === "en" ? item.message : null) ||
              t("telegram.posts.calendar.schedulingPosts"),
            iconUrl: channelPhotoUrl || undefined,
          });
        },
      );
      setProgress({
        id: progressId,
        title: t("telegram.posts.calendar.scheduleDay"),
        current: result.total,
        total: result.total,
        message:
          result.failedCount > 0
            ? t("telegram.posts.calendar.finishedForDate", {
                date: selectedCalendarDateLabel,
              })
            : t("telegram.posts.calendar.scheduledForDate", {
                date: selectedCalendarDateLabel,
              }),
        completed: true,
        successCount: result.successCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        iconUrl: channelPhotoUrl || undefined,
      });
      window.setTimeout(() => clearProgress(progressId), 2800);
      const successfulIds = new Set(
        result.results
          .filter((item) => item.success && item.action === "SCHEDULED")
          .map((item) => item.postId),
      );
      setCalendarBatchSelectedPostIds((current) =>
        current.filter((postId) => !successfulIds.has(postId)),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedLists(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-posts-calendar", channelId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["post-groups", channelId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-post-link-targets", channelId],
        }),
      ]);
      pushToast(
        result.failedCount
          ? t("telegram.posts.calendar.scheduleResult", {
              successful: result.successCount,
              failed: result.failedCount,
            })
          : t("telegram.posts.calendar.scheduledCountForDate", {
              count: result.successCount,
              date: selectedCalendarDateLabel,
            }),
        result.failedCount ? "info" : "success",
      );
    } catch (scheduleError) {
      clearProgress(progressId);
      pushToast(
        localizedApiError(
          scheduleError,
          t("telegram.posts.calendar.error.scheduleDay"),
        ),
        "error",
        7000,
      );
    } finally {
      setCalendarBatchBusy(false);
    }
  };

  const toggleGroupCollapsed = (groupId: string) => {
    setCollapsedGroupIdsPreference((current) => {
      const base = current ?? allGroupIds;
      const next = base.includes(groupId)
        ? base.filter((id) => id !== groupId)
        : [...base, groupId];
      window.localStorage.setItem(
        `telegram-posts-collapsed-groups:${channelId}`,
        JSON.stringify(next),
      );
      return next;
    });
  };

  const scheduleSidebarOrderSave = (visibleOrder: string[]) => {
    const visibleKeys = new Set(visibleOrder);
    let visibleIndex = 0;
    const completeOrder = canonicalSidebarKeys.map((key) =>
      visibleKeys.has(key) ? visibleOrder[visibleIndex++] : key,
    );
    sidebarReorderVersionRef.current += 1;
    const version = sidebarReorderVersionRef.current;
    if (sidebarReorderTimerRef.current) {
      window.clearTimeout(sidebarReorderTimerRef.current);
    }
    sidebarReorderTimerRef.current = window.setTimeout(() => {
      sidebarReorderQueueRef.current = sidebarReorderQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const previousPosts = snapshotManagedPostPages(queryClient, channelId);
          const previousGroups = queryClient.getQueryData<PostGroup[]>([
            "post-groups",
            channelId,
          ]);
          const orderIndex = new Map(completeOrder.map((key, index) => [key, index]));
          mapManagedPostPages(queryClient, channelId, (current) => ({
            ...current,
            items: current.items.map((post) =>
              post.groupId
                ? post
                : {
                    ...post,
                    sidebarPosition:
                      orderIndex.get(`post:${post.id}`) ?? post.sidebarPosition,
                  },
            ),
          }));
          queryClient.setQueryData<PostGroup[]>(
            ["post-groups", channelId],
            (current) =>
              current?.map((group) => ({
                ...group,
                sidebarPosition:
                  orderIndex.get(`group:${group.id}`) ?? group.sidebarPosition,
              })),
          );
          try {
            await telegramChannelsApi.reorderManagedPostSidebar(
              channelId,
              completeOrder,
              true,
            );
            if (version !== sidebarReorderVersionRef.current) return;
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: telegramPostKeys.managedLists(channelId),
              }),
              queryClient.invalidateQueries({
                queryKey: ["post-groups", channelId],
              }),
            ]);
            setSidebarOrderKeys([]);
            pushToast(t("telegram.posts.editor.sidebarOrderSaved"), "success", 3000);
          } catch (reorderError) {
            if (version !== sidebarReorderVersionRef.current) return;
            restoreManagedPostPages(queryClient, previousPosts);
            queryClient.setQueryData(["post-groups", channelId], previousGroups);
            setSidebarOrderKeys([]);
            pushToast(
              localizedApiError(
                reorderError,
                t("telegram.posts.calendar.error.sidebarOrder"),
              ),
              "error",
            );
          }
        });
    }, 700);
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(
        plannerFormatWeightsPreferenceKey(channelId),
      );
      // Channel-local planner weight preferences hydrate the sliders.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlannerFormatWeights(raw ? (JSON.parse(raw) as Record<string, number>) : {});
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlannerFormatWeights({});
    }
  }, [channelId]);

  useEffect(() => {
    window.localStorage.setItem(
      plannerFormatWeightsPreferenceKey(channelId),
      JSON.stringify(plannerFormatWeights),
    );
  }, [channelId, plannerFormatWeights]);

  useEffect(() => {
    if (initialPostView === "groups") {
      setWorkspaceView("groups");
      return;
    }
    const saved = window.localStorage.getItem(`telegram-posts-status:${channelId}`);
    if (saved === "DRAFT" || saved === "SCHEDULED" || saved === "PUBLISHED") {
      // Restore the last tab independently for every Telegram channel.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatusTab(saved);
    } else {
      setStatusTab("DRAFT");
    }
  }, [channelId, initialPostView]);

  useEffect(() => {
    const saved = window.localStorage.getItem(workspaceViewPreferenceKey(channelId));
    setWorkspaceView(saved === "groups" ? "groups" : "posts");
  }, [channelId]);

  useEffect(() => {
    setPostView(initialPostView === "calendar" ? "calendar" : "editor");
    setCalendarMonth(startOfMonth(new Date()));
    setSelectedCalendarDate(toLocalDateKey(new Date()));
  }, [channelId, initialPostView]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(
        `telegram-posts-collapsed-groups:${channelId}`,
      );
      if (!raw) {
        setCollapsedGroupIdsPreference(null);
        return;
      }
      const saved = JSON.parse(raw);
      // Restore the collapsed groups independently for every channel.
      // Null means "no manual preference yet", so groups stay collapsed by default.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsedGroupIdsPreference(
        Array.isArray(saved)
          ? saved.filter((id): id is string => typeof id === "string")
          : null,
      );
    } catch {
      setCollapsedGroupIdsPreference(null);
    }
  }, [channelId]);

  useEffect(() => {
    const saved = window.localStorage.getItem(postGroupPreferenceKey(channelId));
    // Restore the preferred new-post group independently for every channel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRememberedPostGroupId(saved);
    setPostGroupId((current) => current ?? saved);
  }, [channelId]);

  useEffect(() => {
    if (!rememberedPostGroupId || !postGroups.data) return;
    if (postGroups.data.some((group) => group.id === rememberedPostGroupId)) {
      return;
    }
    // Drop stale preferred group ids when a group was deleted or moved away.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    rememberPostGroup(null);
    setPostGroupId((current) => (current === rememberedPostGroupId ? null : current));
    // rememberPostGroup intentionally updates local state and localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rememberedPostGroupId, postGroups.data]);

  const reset = () => {
    const now = localNowParts();
    const nextGroupId = rememberedPostGroupId;
    changeWorkspaceView("posts");
    restoredPostIdRef.current = "";
    setEditing(null);
    setTitle("");
    setTitleManuallyEdited(false);
    setAssignedMemberId(null);
    setMemberSelectionTouched(false);
    setText("");
    setImageUrls([]);
    setButtonRows([]);
    setIcon(null);
    iconRef.current = null;
    iconAutofillRef.current = { active: false, emoji: null };
    setIconPending(false);
    setIconPickerGeneration((current) => current + 1);
    setPostGroupId(nextGroupId);
    setMode("draft");
    setScheduleDate(now.date);
    setScheduleTime(now.time);
    setLongTextMode("IMAGES_THEN_TEXT");
    setUploadingImages(false);
    setSelectedPostIds([]);
    setCreatingPostId(null);
    creatingPostIdRef.current = null;
    setError("");
  };

  useEffect(() => {
    // Header action intentionally resets the editor state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (newPostToken > 0) reset();
    // reset intentionally captures the latest remembered group only when the action fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newPostToken]);

  useEffect(() => {
    if (editing || memberSelectionTouched || assignedMemberId || !currentMemberId) {
      return;
    }
    // Async member data supplies the initial form default.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssignedMemberId(currentMemberId);
  }, [assignedMemberId, currentMemberId, editing, memberSelectionTouched]);

  const selectPost = (post: TelegramManagedPost) => {
    // A newly created post may still be saving in the background. Once the
    // user opens another post, its editor must not inherit that save overlay.
    setCreatingPostId(null);
    setHistoryOpen(false);
    creatingPostIdRef.current = null;
    restoredPostIdRef.current = post.id;
    setEditing(post);
    setTitle(post.title);
    setTitleManuallyEdited(true);
    setAssignedMemberId(effectivePostMemberId(post));
    setMemberSelectionTouched(false);
    setText(post.text || "");
    setImageUrls(post.imageUrls);
    setButtonRows(post.buttonRows ?? []);
    setIcon(post.icon ?? null);
    iconRef.current = post.icon ?? null;
    iconAutofillRef.current = { active: false, emoji: null };
    setIconPending(false);
    const nextGroupId = effectivePostGroupId(post);
    setPostGroupId(nextGroupId);
    rememberPostGroup(nextGroupId);
    setMode(post.status === "SCHEDULED" ? "schedule" : "draft");
    const scheduledLocalParts = post.scheduledAt
      ? localDateTimeParts(post.scheduledAt)
      : null;
    setScheduleDate(scheduledLocalParts?.date || localNowParts().date);
    const postScheduleTime = scheduledLocalParts?.time || localNowParts().time;
    setScheduleTime(postScheduleTime);
    setUploadingImages(false);
    if (
      post.publishMode === "IMAGES_THEN_TEXT" ||
      post.publishMode === "CAPTION_THEN_TEXT"
    ) {
      setLongTextMode(post.publishMode);
    } else {
      setLongTextMode("IMAGES_THEN_TEXT");
    }
    setError("");
  };

  const restorePostRevision = useMutation({
    mutationFn: async (revision: TelegramManagedPostRevision) => {
      if (!editing) throw new Error(t("telegram.posts.editor.error.noPost"));
      if (editing.readOnlyTelegramPost)
        throw new Error("Synced Telegram posts are read-only");
      return telegramChannelsApi.restoreManagedPostHistory(
        channelId,
        editing.id,
        revision.id,
      );
    },
    onSuccess: async (post) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedLists(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-post-history", channelId, post.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-post-link-targets", channelId],
        }),
      ]);
      selectPost(post);
      setRestorePreviewRevision(null);
      setRestoreConfirmationValue("");
      pushToast(
        t("telegram.posts.editor.restored", { title: post.title }),
        "success",
      );
    },
    onError: (mutationError) => {
      pushToast(
        localizedApiError(mutationError, t("telegram.posts.editor.restoreError")),
        "error",
        7000,
      );
    },
  });
  const restoreConfirmationValid = useMemo(
    () =>
      Boolean(
        editing &&
        restorePreviewRevision &&
        restoreConfirmationValue.trim() === editing.title,
      ),
    [editing, restoreConfirmationValue, restorePreviewRevision],
  );
  const returnManagedPostToDraft = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error(t("telegram.posts.editor.error.noPost"));
      if (editing.readOnlyTelegramPost)
        throw new Error("Synced Telegram posts are read-only");
      return telegramChannelsApi.returnManagedPostToDraft(channelId, editing.id);
    },
    onSuccess: async (post) => {
      changeStatusTab("DRAFT");
      selectPost(post);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedLists(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-posts-calendar", channelId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-post-history", channelId, post.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-post-link-targets", channelId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["post-groups", channelId],
        }),
      ]);
      pushToast(
        t("telegram.posts.editor.returnedToDraft", { title: post.title }),
        "success",
      );
    },
    onError: (mutationError) => {
      pushToast(
        localizedApiError(mutationError, t("telegram.posts.editor.returnDraftError")),
        "error",
        7000,
      );
    },
  });

  const toggleAllChannelPosts = () => {
    setSelectedPostIds((current) => {
      if (allChannelPostsSelected) {
        return current.filter((id) => !channelPostIds.includes(id));
      }
      return [...new Set([...current, ...channelPostIds])];
    });
  };

  const togglePostSelected = (postId: string) => {
    setSelectedPostIds((current) =>
      current.includes(postId)
        ? current.filter((id) => id !== postId)
        : [...current, postId],
    );
  };

  const openPost = (post: TelegramManagedPost) => {
    selectPost(post);
    onPostSelect(post.id);
  };

  const openPostInNewTab = (post: { id: string }) => {
    window.open(
      buildTelegramPostsUrl({
        channelId,
        postId: post.id,
        postView: "editor",
      }),
      "_blank",
      "noopener,noreferrer",
    );
  };

  const openPostWithModifier = (
    post: TelegramManagedPost,
    event: Pick<MouseEvent, "metaKey" | "ctrlKey">,
  ) => {
    if (wantsNewTab(event)) {
      openPostInNewTab(post);
      return;
    }
    openPost(post);
  };

  const highlightInternalLinkTarget = (targetId: string) => {
    setHighlightedInternalLinkTargetId(targetId);
    setHighlightRequestKey((current) => current + 1);
  };

  const applyChannelTimePost = (timePost: TelegramChannelTimePost) => {
    setScheduleDate((current) => current || scheduleDateForPreset(timePost.time));
    setScheduleTime(timePost.time);
  };

  const cancelScheduledPostOpen = () => {
    if (postOpenTimerRef.current) {
      window.clearTimeout(postOpenTimerRef.current);
      postOpenTimerRef.current = null;
    }
  };

  const schedulePostOpen = (post: TelegramManagedPost) => {
    cancelScheduledPostOpen();
    postOpenTimerRef.current = window.setTimeout(() => {
      postOpenTimerRef.current = null;
      openPost(post);
    }, POST_OPEN_CLICK_DELAY_MS);
  };

  const changePostIcon = (nextIcon: string | null) => {
    iconRef.current = nextIcon;
    iconAutofillRef.current = { active: false, emoji: null };
    setIcon(nextIcon);
    setIconPending(false);
  };

  const deletePosts = async (targetPosts: TelegramManagedPost[]) => {
    if (targetPosts.some((post) => post.readOnlyTelegramPost)) {
      pushToast(t("telegram.posts.editor.readOnlyDelete"), "info");
      return;
    }
    const progressId = `managed-post-delete:${channelId}`;
    try {
      setProgress({
        id: progressId,
        title: t("telegram.posts.editor.deletePosts"),
        current: 0,
        total: targetPosts.length,
        message: t("telegram.posts.editor.deleting"),
        iconUrl: channelPhotoUrl || undefined,
      });
      const result = await telegramChannelsApi.deleteManagedPosts(
        channelId,
        targetPosts.map((post) => post.id),
        (item, current, total) => {
          setProgress({
            id: progressId,
            title: t("telegram.posts.editor.deletePosts"),
            current,
            total,
            message:
              (locale === "en" ? item.message : null) ||
              t("telegram.posts.editor.deleting"),
            iconUrl: channelPhotoUrl || undefined,
          });
        },
      );
      setProgress({
        id: progressId,
        title: t("telegram.posts.editor.deletePosts"),
        current: result.total,
        total: result.total,
        message: t("telegram.posts.editor.deleteResult", {
          deleted: result.successCount,
          failed: result.failedCount,
          skipped: result.skippedCount,
        }),
        completed: true,
        successCount: result.successCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        iconUrl: channelPhotoUrl || undefined,
      });
      window.setTimeout(() => clearProgress(progressId), 2800);
      const deletedPostIds = new Set(
        result.results.filter((item) => item.success).map((item) => item.postId),
      );
      if (editing?.id && deletedPostIds.has(editing.id)) {
        reset();
        onPostSelect(null);
      }
      setSelectedPostIds((current) =>
        current.filter((id) => !deletedPostIds.has(id)),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedLists(channelId),
        }),
        queryClient.invalidateQueries({ queryKey: ["post-groups", channelId] }),
      ]);
      pushToast(
        result.failedCount
          ? t("telegram.posts.editor.deleteResultShort", {
              successful: result.successCount,
              failed: result.failedCount,
            })
          : targetPosts.length === 1
            ? t("telegram.posts.editor.deleted", {
                title: targetPosts[0].title,
              })
            : t("telegram.posts.editor.deletedCount", {
                count: result.successCount,
              }),
        result.failedCount ? "info" : "success",
      );
    } catch (error) {
      clearProgress(progressId);
      pushToast(
        localizedApiError(error, t("telegram.posts.editor.deleteError")),
        "error",
        7000,
      );
    }
  };

  useEffect(() => {
    if (!initialPostId) return;
    // The URL is the source of truth for a deep-linked post. Updating the
    // workspace tab here must not navigate again, otherwise the postId that
    // was just added by openPost() is immediately removed from the URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspaceView("posts");
    onWorkspaceViewChange("posts");
    window.localStorage.setItem(workspaceViewPreferenceKey(channelId), "posts");
  }, [channelId, initialPostId, onWorkspaceViewChange]);

  useEffect(() => {
    if (!initialGroupId) return;
    changeWorkspaceView("groups");
  }, [initialGroupId]);

  useEffect(() => {
    if (!initialPostId || !posts.data?.length || postGroups.isLoading) return;
    if (restoredPostIdRef.current === initialPostId) return;
    const post = posts.data.find((item) => item.id === initialPostId);
    // URL restoration intentionally hydrates the local editor state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (post) {
      const nextStatusTab = managedPostStatusTab(
        post.status,
        isBrokenPublishedPost(post),
      );
      setStatusTab(nextStatusTab);
      window.localStorage.setItem(
        `telegram-posts-status:${channelId}`,
        nextStatusTab,
      );
      const linkedGroupId = effectivePostGroupId(post);
      if (linkedGroupId) {
        setCollapsedGroupIdsPreference((current) => {
          const next = expandDeepLinkedPostGroup(current, allGroupIds, linkedGroupId);
          window.localStorage.setItem(
            `telegram-posts-collapsed-groups:${channelId}`,
            JSON.stringify(next),
          );
          return next;
        });
      }
      selectPost(post);
    }
    // selectPost is intentionally excluded to avoid rehydrating on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPostId, postGroups.data, postGroups.isLoading, posts.data]);

  const run = () => {
    if (isReadOnlyTelegramPost) return;
    const editingPost = editing;
    const saveMode = effectivePublishingMode;
    const saveTitle = title.trim();
    const saveGroupId = postGroupId;
    const saveIcon = iconRef.current;
    const saveLongTextMode = longTextMode;
    if (saveMode === "schedule" && !isValidTimeInputValue(scheduleTime)) {
      setError(t("telegram.posts.editor.invalidPublishTime"));
      return;
    }
    const saveScheduledAt =
      saveMode === "schedule" && isValidTimeInputValue(scheduleTime)
        ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
        : null;
    const payload: {
      title: string;
      text: string;
      imageUrls: string[];
      buttonRows: TelegramPostButtonRows;
      assignedMemberId?: string;
      icon?: string | null;
    } = {
      title: saveTitle,
      text,
      imageUrls: [...imageUrls],
      buttonRows,
      icon: saveIcon,
    };
    const selectedMemberId =
      assignedMemberId ??
      (!editingPost && !memberSelectionTouched ? currentMemberId : null);
    if (selectedMemberId && (!editingPost || memberSelectionTouched)) {
      payload.assignedMemberId = selectedMemberId;
    }
    const isPublishedEdit = editingMeta?.status === "PUBLISHED";
    const shouldRepublishPublished =
      editingMeta?.status === "PUBLISHED" && telegramLinkBroken;
    const pendingId =
      editingPost?.id ||
      `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nextStatusTab: PostStatusTab = editingPost
      ? editingPost.status === "PUBLISHED"
        ? "PUBLISHED"
        : editingPost.status === "SCHEDULED"
          ? "SCHEDULED"
          : saveMode === "schedule"
            ? "SCHEDULED"
            : saveMode === "publish"
              ? "PUBLISHED"
              : "DRAFT"
      : saveMode === "schedule"
        ? "SCHEDULED"
        : saveMode === "publish"
          ? "PUBLISHED"
          : "DRAFT";
    if (editingPost) {
      setSavingPostIds((current) => [...new Set([...current, pendingId])]);
    } else {
      setCreatingPostId(pendingId);
      creatingPostIdRef.current = pendingId;
      setPendingPostSaves((current) => [
        {
          id: pendingId,
          title: saveTitle,
          icon: saveIcon,
          groupId: saveGroupId,
          mode: saveMode,
        },
        ...current,
      ]);
    }
    changeStatusTab(nextStatusTab);
    void (async () => {
      let persisted = false;
      try {
        if (saveMode === "publish" || saveMode === "schedule") {
          if (!channelPublishingCapabilities?.source) {
            throw new Error(t("telegram.posts.editor.error.publishingSource"));
          }
          if (
            buttonRows.length &&
            !channelPublishingCapabilities.canPublishInlineButtons
          ) {
            throw new Error(t("telegram.posts.editor.error.inlineButtonsPermission"));
          }
        }
        let post = editingPost
          ? await telegramChannelsApi.updateManagedPost(
              channelId,
              editingPost.id,
              payload,
              true,
            )
          : await telegramChannelsApi.createManagedPost(channelId, payload, true);
        persisted = true;
        if (saveGroupId && saveGroupId !== (editingPost?.groupId ?? null)) {
          const group = await telegramChannelsApi.addPostsToGroup(
            saveGroupId,
            [post.id],
            true,
          );
          queryClient.setQueryData<PostGroup[]>(
            telegramPostKeys.postGroups(channelId),
            (current) =>
              current?.map((item) => (item.id === group.id ? group : item)),
          );
          post = { ...post, groupId: group.id, group };
        } else if (editingPost?.groupId && !saveGroupId) {
          const group = await telegramChannelsApi.removePostFromGroup(
            editingPost.groupId,
            post.id,
            true,
          );
          queryClient.setQueryData<PostGroup[]>(
            telegramPostKeys.postGroups(channelId),
            (current) =>
              current?.map((item) => (item.id === group.id ? group : item)),
          );
          post = { ...post, groupId: null, group: null };
        }
        if (shouldRepublishPublished) {
          post = await telegramChannelsApi.publishManagedPost(
            channelId,
            post.id,
            saveLongTextMode,
            true,
          );
        } else if (isPublishedEdit) {
          // Published posts are updated in place by PATCH.
          // Never run the publish endpoint again after a Telegram text edit.
        } else if (saveMode === "publish") {
          post = await telegramChannelsApi.publishManagedPost(
            channelId,
            post.id,
            saveLongTextMode,
            true,
          );
        } else if (
          saveMode === "schedule" &&
          saveScheduledAt &&
          !managedPostScheduleUnchanged(editingPost, saveScheduledAt)
        ) {
          post = await telegramChannelsApi.scheduleManagedPost(
            channelId,
            post.id,
            saveScheduledAt,
            saveLongTextMode,
            true,
          );
        }
        reconcileManagedPost(queryClient, channelId, post);
        if (!editingPost) {
          await queryClient.invalidateQueries({
            queryKey: telegramPostKeys.managedLists(channelId),
          });
        }
        if (editingPost) {
          setEditing((current) => (current?.id === post.id ? post : current));
        } else if (creatingPostIdRef.current === pendingId) {
          selectPost(post);
          onPostSelect(post.id);
        }
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: telegramPostKeys.managedCalendar(channelId),
          }),
          queryClient.invalidateQueries({
            queryKey: telegramPostKeys.linkTargets(channelId),
          }),
        ]);
        const savedIcon = post.iconPresentation ?? null;
        const toastIcon = savedIcon
          ? {
              emoji: savedIcon.type === "unicode" ? savedIcon.value : null,
              imageUrl: savedIcon.type === "image" ? savedIcon.url : null,
            }
          : undefined;
        pushToast(
          shouldRepublishPublished
            ? t("telegram.posts.editor.publishedAgain", { title: saveTitle })
            : editingMeta?.status === "PUBLISHED"
              ? t("telegram.posts.editor.updatedTelegram", { title: saveTitle })
              : saveMode === "publish"
                ? t("telegram.posts.editor.publishedNamed", {
                    title: saveTitle,
                  })
                : saveMode === "schedule"
                  ? managedPostScheduleUi({
                      title: saveTitle,
                      scheduleMode: post.scheduleMode,
                      t,
                    }).message
                  : t("telegram.posts.editor.savedNamed", { title: saveTitle }),
          "success",
          post.scheduleMode === "LOCAL" ? 7000 : 3500,
          toastIcon,
        );
      } catch (runError) {
        if (persisted) {
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: telegramPostKeys.managedLists(channelId),
            }),
            queryClient.invalidateQueries({
              queryKey: telegramPostKeys.managedCalendar(channelId),
            }),
            queryClient.invalidateQueries({
              queryKey: telegramPostKeys.linkTargets(channelId),
            }),
          ]);
        }
        pushToast(
          localizedApiError(
            runError,
            t("telegram.posts.editor.saveError", { title: saveTitle }),
          ),
          "error",
          7000,
        );
      } finally {
        setPendingPostSaves((current) =>
          current.filter((item) => item.id !== pendingId),
        );
        setCreatingPostId((current) => (current === pendingId ? null : current));
        if (creatingPostIdRef.current === pendingId) {
          creatingPostIdRef.current = null;
        }
        setSavingPostIds((current) => current.filter((id) => id !== pendingId));
      }
    })();
  };

  const changePostGroup = (nextGroupId: string) => {
    const normalized = nextGroupId || null;
    setPostGroupId(normalized);
    rememberPostGroup(normalized);
  };

  useEffect(() => {
    if (editing || titleManuallyEdited) return;
    const nextAutoTitle = autoPrefilledTitle?.title ?? "";
    if (title === nextAutoTitle) return;
    setTitle(nextAutoTitle);
  }, [autoPrefilledTitle?.title, editing, title, titleManuallyEdited]);

  useEffect(() => {
    if (editing) return;
    const nextEmoji = autoPrefilledTitle?.emoji ?? null;
    const canAutofillIcon = !iconRef.current || iconAutofillRef.current.active;

    if (!canAutofillIcon) return;

    if (!nextEmoji) {
      if (iconAutofillRef.current.active) {
        iconAutofillRef.current = { active: false, emoji: null };
        iconRef.current = null;
        setIcon(null);
      }
      return;
    }

    if (
      iconAutofillRef.current.active &&
      iconAutofillRef.current.emoji === nextEmoji
    ) {
      return;
    }

    const requestId = iconAutofillRequestRef.current + 1;
    iconAutofillRequestRef.current = requestId;

    void (async () => {
      try {
        const createdIcon = await iconsApi.createEmoji({
          name: autoPrefilledTitle?.title || nextEmoji,
          emoji: nextEmoji,
        });
        if (iconAutofillRequestRef.current !== requestId) return;
        if (iconRef.current && !iconAutofillRef.current.active) return;
        iconAutofillRef.current = { active: true, emoji: nextEmoji };
        iconRef.current = createdIcon.id;
        setIcon(createdIcon.id);
      } catch {
        if (iconAutofillRequestRef.current !== requestId) return;
        iconAutofillRef.current = { active: false, emoji: null };
      }
    })();
  }, [autoPrefilledTitle?.emoji, autoPrefilledTitle?.title, editing]);

  return (
    <>
      <PageTabHead
        title={`${
          workspaceView === "groups"
            ? t("telegram.posts.tabs.groups")
            : postView === "calendar"
              ? t("telegram.posts.tabs.calendar")
              : t("telegram.posts.tabs.posts")
        } · ${channelTitle} · Telegram System`}
        iconUrl={channelPhotoUrl || null}
        emoji={
          workspaceView === "groups" ? "🗂️" : postView === "calendar" ? "🗓️" : "✈️"
        }
        color={
          workspaceView === "groups"
            ? "#475569"
            : postView === "calendar"
              ? "#7c2d12"
              : "#1d4ed8"
        }
      />
      <div className="mb-4 flex min-w-0 flex-wrap items-center gap-3">
        <div className="inline-flex shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
          <button
            type="button"
            onClick={() => changeWorkspaceView("posts")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm ${
              workspaceView === "posts"
                ? "bg-blue-600 text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <FileText size={15} />
            {t("telegram.posts.tabs.posts")}
          </button>
          <button
            type="button"
            onClick={() => changeWorkspaceView("groups")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm ${
              workspaceView === "groups"
                ? "bg-blue-600 text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Layers3 size={15} />
            {t("telegram.posts.tabs.groups")}
          </button>
        </div>
        {workspaceView === "posts" ? (
          <div className="inline-flex shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
            <button
              type="button"
              onClick={() => changePostView("editor")}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm ${
                postView === "editor"
                  ? "bg-blue-600 text-white"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <FileText size={15} />
              {t("telegram.posts.tabs.editor")}
            </button>
            <button
              type="button"
              onClick={() => changePostView("calendar")}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm ${
                postView === "calendar"
                  ? "bg-blue-600 text-white"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Clock3 size={15} />
              {t("telegram.posts.tabs.calendar")}
            </button>
          </div>
        ) : null}
      </div>
      <Modal
        open={importMode === "calendar"}
        onClose={() => onImportModeChange(null)}
        title={t("telegram.posts.import.title")}
        size="xl"
      >
        <div className="grid gap-4">
          <div className="space-y-4">
            <ChannelImportNavigation
              value="calendar"
              onChange={onImportModeChange}
              disabled={autoPlannerBusy}
            />
            <div>
              <CalendarPlanImport
                channelId={channelId}
                channelTitle={channelTitle}
                posts={calendarSchedulablePosts.map((post) => ({
                  id: post.id,
                  title: post.title,
                  groupId: effectivePostGroupId(post),
                }))}
                timezone={Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"}
                disabled={autoPlannerBusy}
                content={calendarPlanImportContent}
                onContentChange={setCalendarPlanImportContent}
                onPreview={setAutoPlannerPreview}
              />
              {autoPlannerPreview && autoPlannerPreviewSource === "import" ? (
                <AutoCalendarPlannerPreview
                  preview={autoPlannerPreview}
                  busy={autoPlannerBusy}
                  rerollingDate={null}
                  onScheduleAll={scheduleAutoPlannerPreview}
                  availablePosts={calendarSchedulablePosts.map((post) => ({
                    id: post.id,
                    title: post.title,
                    iconPresentation: post.iconPresentation,
                  }))}
                  onRemoveAssignment={removeAutoPlannerAssignment}
                  onReplaceAssignmentPost={replaceAutoPlannerAssignmentPost}
                  onOpenPostInNewTab={(postId) => {
                    const post = calendarSchedulablePosts.find(
                      (item) => item.id === postId,
                    );
                    if (post) openPostInNewTab(post);
                  }}
                />
              ) : null}
            </div>
            <Card className={autoPlannerMode === "system" ? "p-4" : "hidden"}>
              <div className="flex flex-wrap items-end gap-3">
                <FormField label={t("telegram.posts.calendar.startDate")}>
                  <DateInput
                    value={autoPlannerFrom}
                    onChange={(event) => {
                      const next = event.target.value;
                      setAutoPlannerFrom(next);
                      if (autoPlannerDays > 0) {
                        setAutoPlannerTo(
                          toLocalDateKey(
                            addDays(
                              new Date(`${next}T00:00:00`),
                              autoPlannerDays - 1,
                            ),
                          ),
                        );
                      }
                    }}
                  />
                </FormField>
                <FormField label={t("telegram.posts.calendar.range")}>
                  <CustomSelect
                    value={String(autoPlannerDays)}
                    onChange={(value) => {
                      const days = Number(value);
                      setAutoPlannerDays(days);
                      if (days > 0) {
                        setAutoPlannerTo(
                          toLocalDateKey(
                            addDays(
                              new Date(`${autoPlannerFrom}T00:00:00`),
                              days - 1,
                            ),
                          ),
                        );
                      }
                    }}
                    options={[
                      ...[7, 10, 14, 20, 30].map((days) => ({
                        value: String(days),
                        label: t("telegram.posts.calendar.days", {
                          count: days,
                        }),
                      })),
                      {
                        value: "0",
                        label: t("telegram.posts.calendar.custom"),
                      },
                    ]}
                  />
                </FormField>
                {autoPlannerDays === 0 ? (
                  <FormField label={t("telegram.posts.calendar.endDate")}>
                    <DateInput
                      value={autoPlannerTo}
                      onChange={(event) => setAutoPlannerTo(event.target.value)}
                    />
                  </FormField>
                ) : null}
                <Button
                  onClick={fillPlannerRange}
                  disabled={autoPlannerBusy || !canUsePlannerFormatSlots}
                >
                  <span className="inline-flex items-center gap-2">
                    {autoPlannerBusy ? (
                      <LoaderCircle size={15} className="animate-spin" />
                    ) : (
                      <ListPlus size={15} />
                    )}
                    {t("telegram.posts.calendar.previewFill")}
                  </span>
                </Button>
              </div>
              {!hasPlannerFormatSlots ? (
                <p className="mt-3 rounded-lg border border-amber-800/60 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
                  {t("telegram.posts.calendar.addSlotBeforePreview")}
                </p>
              ) : null}
              {plannerFormatsWithWeights.length ? (
                <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-white">
                      {t("telegram.posts.calendar.formatFrequencyTitle")}
                    </h4>
                    <span className="text-xs text-neutral-500">
                      {t("telegram.posts.calendar.frequencyShare")}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {plannerFormatsWithWeights.map(({ format, weight }) => (
                      <div
                        key={format.id}
                        className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.5fr)_56px] md:items-center"
                      >
                        <div className="flex min-w-0 items-center gap-2 text-sm text-neutral-200">
                          <span className="shrink-0">{format.icon || "◌"}</span>
                          <span className="truncate">{format.name}</span>
                        </div>
                        <PlannerFormatWeightSlider
                          label={t("telegram.posts.calendar.formatFrequency", {
                            name: format.name,
                          })}
                          value={weight}
                          disabled={autoPlannerBusy}
                          onChange={(nextWeight) =>
                            setPlannerFormatWeights((current) =>
                              redistributePlannerFormatWeight(
                                (plannerFormats.data || []).map((item) => item.id),
                                current,
                                format.id,
                                nextWeight,
                              ),
                            )
                          }
                        />
                        <div className="text-right text-xs tabular-nums text-neutral-400">
                          {weight}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {autoPlannerPreview && autoPlannerPreviewSource === "system" ? (
                <AutoCalendarPlannerPreview
                  preview={autoPlannerPreview}
                  busy={autoPlannerBusy}
                  rerollingDate={autoPlannerRerollingDate}
                  onRerollDay={rerollAutoPlannerDay}
                  onScheduleAll={scheduleAutoPlannerPreview}
                  availablePosts={calendarSchedulablePosts.map((post) => ({
                    id: post.id,
                    title: post.title,
                    iconPresentation: post.iconPresentation,
                  }))}
                  onRemoveAssignment={removeAutoPlannerAssignment}
                  onReplaceAssignmentPost={replaceAutoPlannerAssignmentPost}
                  onOpenPostInNewTab={(postId) => {
                    const post = calendarSchedulablePosts.find(
                      (item) => item.id === postId,
                    );
                    if (post) openPostInNewTab(post);
                  }}
                />
              ) : null}
            </Card>

            <Card className={autoPlannerMode === "system" ? "p-4" : "hidden"}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">
                  {t("telegram.posts.calendar.formats")}
                </h3>
                {plannerFormats.isLoading ? (
                  <LoaderCircle size={15} className="animate-spin text-neutral-500" />
                ) : null}
              </div>
              <div className="flex gap-2">
                <PlannerFormatEmojiPicker
                  value={newPlannerFormatIcon}
                  disabled={autoPlannerBusy}
                  onChange={(nextIcon) => setNewPlannerFormatIcon(nextIcon ?? "")}
                  onError={(error) =>
                    pushToast(
                      localizedApiError(
                        error,
                        t("telegram.posts.calendar.error.selectEmoji"),
                      ),
                      "error",
                    )
                  }
                />
                <Input
                  value={newPlannerFormatName}
                  onChange={(event) => setNewPlannerFormatName(event.target.value)}
                  placeholder={t("telegram.posts.calendar.formatName")}
                />
                <Button
                  variant="secondary"
                  onClick={createPlannerFormat}
                  disabled={autoPlannerBusy || !newPlannerFormatName.trim()}
                >
                  <Plus size={15} />
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {(plannerFormats.data || []).map((format) => {
                  const slotGroups = plannerSlotGroupsByFormatId.get(format.id) || [];
                  const draft = plannerSlotDraftsByFormatId[format.id] || {
                    timePostIds: [],
                    groupIds: [],
                  };
                  const formatDraft = plannerFormatDraftsById[format.id];
                  const editableFormat = formatDraft ?? {
                    name: format.name,
                    icon: format.icon ?? "",
                  };
                  const formatDirty = Boolean(
                    formatDraft &&
                    (formatDraft.name !== format.name ||
                      formatDraft.icon !== (format.icon ?? "")),
                  );
                  const formatEditing = editingPlannerFormatIds.includes(format.id);
                  return (
                    <div
                      key={format.id}
                      className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3"
                    >
                      <div className="flex items-center gap-3">
                        {formatEditing ? (
                          <>
                            <PlannerFormatEmojiPicker
                              value={editableFormat.icon}
                              disabled={autoPlannerBusy}
                              className="h-8 w-8"
                              iconClassName="!h-4 !w-4 !bg-transparent"
                              onChange={(nextIcon) =>
                                updatePlannerFormatDraft(format, {
                                  icon: nextIcon ?? "",
                                })
                              }
                              onError={(error) =>
                                pushToast(
                                  localizedApiError(
                                    error,
                                    t("telegram.posts.calendar.error.updateEmoji"),
                                  ),
                                  "error",
                                )
                              }
                            />
                            <Input
                              value={editableFormat.name}
                              disabled={autoPlannerBusy}
                              onChange={(event) =>
                                updatePlannerFormatDraft(format, {
                                  name: event.target.value,
                                })
                              }
                              className="h-9 min-w-0 flex-1"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={
                                autoPlannerBusy ||
                                !formatDirty ||
                                !editableFormat.name.trim()
                              }
                              onClick={() => savePlannerFormatDraft(format)}
                              className="h-9 shrink-0 border-emerald-800/70 bg-emerald-950/35 px-3 text-emerald-100 hover:bg-emerald-900/45 disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-500"
                            >
                              <Check size={14} /> {t("common.save")}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={autoPlannerBusy}
                              onClick={() => {
                                setPlannerFormatDraftsById((current) => {
                                  const next = { ...current };
                                  delete next[format.id];
                                  return next;
                                });
                                setEditingPlannerFormatIds((current) =>
                                  current.filter((id) => id !== format.id),
                                );
                              }}
                              className="h-9 shrink-0 px-3"
                            >
                              {t("common.cancel")}
                            </Button>
                            <button
                              type="button"
                              disabled={autoPlannerBusy}
                              onClick={() => setDeletingPlannerFormat(format)}
                              className="rounded-md border border-red-800/70 p-1.5 text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                              aria-label={t(
                                "telegram.posts.calendar.deleteNamedFormat",
                                {
                                  name: format.name,
                                },
                              )}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-lg">{format.icon || "◌"}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">
                                {format.name}
                              </p>
                              <p className="text-xs text-neutral-500">
                                {t("telegram.posts.calendar.configuredSlots", {
                                  count: slotGroups.length,
                                })}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                setEditingPlannerFormatIds((current) => [
                                  ...current,
                                  format.id,
                                ])
                              }
                            >
                              <Pencil size={14} /> {t("common.edit")}
                            </Button>
                          </>
                        )}
                      </div>
                      {formatEditing ? (
                        <div className="mt-3 space-y-2">
                          {slotGroups.map((slotGroup) => {
                            const primarySlot = slotGroup.slots[0];
                            const slotDraft = plannerSlotEditDraftsById[
                              slotGroup.id
                            ] ?? {
                              timePostIds: slotGroup.timePostIds,
                              groupIds: slotGroup.groupIds,
                            };
                            const selectedTimePosts = slotDraft.timePostIds
                              .map((timePostId) =>
                                plannerTimePostsById.get(timePostId),
                              )
                              .filter(
                                (timePost): timePost is TelegramChannelTimePost =>
                                  Boolean(timePost),
                              );
                            const slotDirty =
                              !sameStringSet(
                                slotDraft.timePostIds,
                                slotGroup.timePostIds,
                              ) ||
                              !sameStringSet(slotDraft.groupIds, slotGroup.groupIds);
                            const slotEditing = editingPlannerSlotGroupIds.includes(
                              slotGroup.id,
                            );
                            const displayTimePosts = selectedTimePosts.length
                              ? selectedTimePosts
                              : slotGroup.slots
                                  .map((slot) =>
                                    plannerTimePostsByTime.get(slot.time),
                                  )
                                  .filter(
                                    (timePost): timePost is TelegramChannelTimePost =>
                                      Boolean(timePost),
                                  );
                            const groups = slotDraft.groupIds
                              .map((groupId) => postGroupsById.get(groupId))
                              .filter((group): group is PostGroup => Boolean(group));
                            return (
                              <div
                                key={slotGroup.id}
                                className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
                              >
                                <div className="flex items-start gap-2">
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-neutral-100">
                                      {displayTimePosts.length ? (
                                        displayTimePosts.map((timePost) => (
                                          <span
                                            key={timePost.id}
                                            className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1"
                                          >
                                            {timePost.iconPresentation ? (
                                              <IconAvatar
                                                icon={timePost.iconPresentation}
                                                label={timePost.title}
                                                size="xs"
                                                bordered={false}
                                                className="!bg-transparent"
                                              />
                                            ) : (
                                              <Clock3
                                                size={14}
                                                className="shrink-0 text-neutral-500"
                                              />
                                            )}
                                            <span className="shrink-0 font-semibold">
                                              {timePost.time}
                                            </span>
                                            <span className="min-w-0 truncate text-neutral-300">
                                              {timePost.title}
                                            </span>
                                          </span>
                                        ))
                                      ) : (
                                        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-400">
                                          <Clock3 size={14} />
                                          {primarySlot?.time ??
                                            t("telegram.posts.calendar.noTime")}
                                        </span>
                                      )}
                                      {groups.length ? (
                                        groups.map((group) => (
                                          <span
                                            key={group.id}
                                            className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1"
                                          >
                                            <PostIcon
                                              iconId={group.icon}
                                              icon={group.iconPresentation}
                                              label={telegramPostGroupTitle(group, t)}
                                              bare
                                            />
                                            <span className="min-w-0 truncate text-neutral-300">
                                              {telegramPostGroupTitle(group, t)}
                                            </span>
                                          </span>
                                        ))
                                      ) : (
                                        <span className="inline-flex items-center rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-400">
                                          {t("telegram.posts.calendar.anyGroup")}
                                        </span>
                                      )}
                                    </div>
                                    {slotEditing ? (
                                      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                                        <FormField
                                          label={t("telegram.posts.calendar.groups")}
                                        >
                                          <MultiSelect
                                            value={slotDraft.groupIds}
                                            onChange={(groupIds) =>
                                              updatePlannerSlotGroupEditDraft(
                                                slotGroup,
                                                {
                                                  groupIds,
                                                },
                                              )
                                            }
                                            options={plannerGroupOptions}
                                            placeholder={t(
                                              "telegram.posts.calendar.anyGroup",
                                            )}
                                            allSelectedLabel={t(
                                              "telegram.posts.calendar.allGroups",
                                            )}
                                          />
                                        </FormField>
                                        <FormField
                                          label={t(
                                            "telegram.posts.calendar.publishingTime",
                                          )}
                                        >
                                          <MultiSelect
                                            value={slotDraft.timePostIds}
                                            onChange={(timePostIds) =>
                                              updatePlannerSlotGroupEditDraft(
                                                slotGroup,
                                                {
                                                  timePostIds,
                                                },
                                              )
                                            }
                                            options={plannerTimePostOptions}
                                            placeholder={t(
                                              "telegram.posts.calendar.selectTime",
                                            )}
                                            allSelectedLabel={t(
                                              "telegram.posts.calendar.allTimes",
                                            )}
                                          />
                                        </FormField>
                                        <div className="flex md:pt-[22px]">
                                          <Button
                                            type="button"
                                            variant="secondary"
                                            disabled={
                                              autoPlannerBusy ||
                                              !slotDirty ||
                                              !slotDraft.timePostIds.length
                                            }
                                            onClick={() =>
                                              savePlannerSlotGroupEditDraft(slotGroup)
                                            }
                                            className="h-10 shrink-0 border-emerald-800/70 bg-emerald-950/35 px-3 text-emerald-100 hover:bg-emerald-900/45 disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-500"
                                          >
                                            <span className="inline-flex items-center gap-1.5">
                                              <Check size={14} />
                                              {t("common.save")}
                                            </span>
                                          </Button>
                                        </div>
                                        <div className="flex md:pt-[22px]">
                                          <Button
                                            type="button"
                                            variant="secondary"
                                            disabled={autoPlannerBusy}
                                            onClick={() => {
                                              resetPlannerSlotEditDraft(slotGroup.id);
                                              setEditingPlannerSlotGroupIds(
                                                (current) =>
                                                  current.filter(
                                                    (id) => id !== slotGroup.id,
                                                  ),
                                              );
                                            }}
                                            className="h-10 shrink-0 border-amber-800/60 bg-amber-950/20 px-3 text-amber-100 hover:bg-amber-900/30 disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-500"
                                          >
                                            <span className="inline-flex items-center gap-1.5">
                                              <RotateCcw size={14} />
                                              {t("common.cancel")}
                                            </span>
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        className="h-8 px-2.5 text-xs"
                                        onClick={() =>
                                          setEditingPlannerSlotGroupIds((current) => [
                                            ...current,
                                            slotGroup.id,
                                          ])
                                        }
                                      >
                                        <Pencil size={13} />{" "}
                                        {t("telegram.posts.calendar.editSlot")}
                                      </Button>
                                    )}
                                  </div>
                                  {slotEditing ? (
                                    <button
                                      type="button"
                                      disabled={autoPlannerBusy}
                                      onClick={() =>
                                        setDeletingPlannerSlotGroup(slotGroup)
                                      }
                                      className="rounded-md border border-red-800/70 p-1.5 text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                                      aria-label={t(
                                        "telegram.posts.calendar.deleteSlot",
                                      )}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                          {!slotGroups.length ? (
                            <div className="rounded-lg border border-dashed border-neutral-800 px-3 py-3 text-sm text-neutral-500">
                              {t("telegram.posts.calendar.noSlotsInFormat")}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {formatEditing ? (
                        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                          <FormField label={t("telegram.posts.calendar.groups")}>
                            <MultiSelect
                              value={draft.groupIds}
                              onChange={(groupIds) =>
                                setPlannerSlotDraftsByFormatId((current) => ({
                                  ...current,
                                  [format.id]: {
                                    timePostIds: draft.timePostIds,
                                    groupIds,
                                  },
                                }))
                              }
                              options={plannerGroupOptions}
                              placeholder={t("telegram.posts.calendar.anyGroup")}
                              allSelectedLabel={t(
                                "telegram.posts.calendar.allGroups",
                              )}
                            />
                          </FormField>
                          <FormField
                            label={t("telegram.posts.calendar.publishingTime")}
                          >
                            <MultiSelect
                              value={draft.timePostIds}
                              onChange={(timePostIds) =>
                                setPlannerSlotDraftsByFormatId((current) => ({
                                  ...current,
                                  [format.id]: {
                                    timePostIds,
                                    groupIds: draft.groupIds,
                                  },
                                }))
                              }
                              options={plannerTimePostOptions}
                              placeholder={t("telegram.posts.calendar.selectTime")}
                              allSelectedLabel={t("telegram.posts.calendar.allTimes")}
                            />
                          </FormField>
                          <div className="flex md:pt-[22px]">
                            <Button
                              variant="secondary"
                              onClick={() => createPlannerSlot(format.id)}
                              disabled={autoPlannerBusy || !draft.timePostIds.length}
                              className="inline-flex h-10 min-w-[112px] shrink-0 items-center justify-center gap-2 whitespace-nowrap"
                            >
                              <Plus size={15} />
                              {draft.timePostIds.length > 1
                                ? t("telegram.posts.calendar.addSlots")
                                : t("telegram.posts.calendar.addOneSlot")}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!plannerFormats.isLoading && !plannerFormats.data?.length ? (
                  <div className="rounded-lg border border-dashed border-neutral-800 px-3 py-4 text-sm text-neutral-500">
                    {t("telegram.posts.calendar.noFormats")}
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      </Modal>
      <ConfirmDeleteModal
        open={Boolean(deletingPlannerFormat)}
        onClose={() => setDeletingPlannerFormat(null)}
        entityName={deletingPlannerFormat?.name || ""}
        label={t("telegram.posts.calendar.deleteFormat")}
        description={t("telegram.posts.calendar.deleteFormatDescription")}
        onConfirm={async () => {
          if (!deletingPlannerFormat) return;
          await runPlannerMutation(
            () =>
              telegramChannelsApi.deletePostPlannerFormat(
                channelId,
                deletingPlannerFormat.id,
              ),
            t("telegram.posts.calendar.formatDeleted"),
          );
          setDeletingPlannerFormat(null);
        }}
      />
      <TelegramCustomEmojiPacksModal
        open={customEmojiPacksOpen}
        onClose={() => setCustomEmojiPacksOpen(false)}
        currentChannelId={channelId}
        channels={channels.map((channel) => ({
          id: channel.id,
          title: channel.title,
        }))}
        packs={customEmojiPacks.data?.packs || []}
        onImport={async (input) => {
          const response = await telegramChannelsApi.importCustomEmojiPack(
            channelId,
            input,
          );
          queryClient.setQueryData(
            telegramChannelKeys.customEmojiPacks(channelId),
            response,
          );
          await queryClient.invalidateQueries({
            queryKey: ["telegram-channel-custom-emoji-packs"],
          });
        }}
        onDetach={async (packId, target) => {
          const response = await telegramChannelsApi.detachCustomEmojiPack(
            channelId,
            packId,
            target,
          );
          queryClient.setQueryData(
            telegramChannelKeys.customEmojiPacks(channelId),
            response,
          );
          await queryClient.invalidateQueries({
            queryKey: ["telegram-channel-custom-emoji-packs"],
          });
        }}
      />
      <ConfirmDeleteModal
        open={Boolean(deletingPlannerSlotGroup)}
        onClose={() => setDeletingPlannerSlotGroup(null)}
        entityName={
          deletingPlannerSlotGroup
            ? t("telegram.posts.calendar.publishingTimes", {
                count: deletingPlannerSlotGroup.timePostIds.length,
              })
            : ""
        }
        label={t("telegram.posts.calendar.deleteSlot")}
        description={t("telegram.posts.calendar.deleteSlotDescription")}
        onConfirm={async () => {
          if (!deletingPlannerSlotGroup) return;
          await runPlannerMutation(
            () =>
              telegramChannelsApi.mutatePostPlannerSlotsWithProgress(
                channelId,
                deletingPlannerSlotGroup.slots.map((slot) => ({
                  action: "DELETE" as const,
                  slotId: slot.id,
                })),
                () => undefined,
              ),
            deletingPlannerSlotGroup.slots.length === 1
              ? t("telegram.posts.calendar.slotDeleted")
              : t("telegram.posts.calendar.slotsDeleted", {
                  count: deletingPlannerSlotGroup.slots.length,
                }),
          );
          setDeletingPlannerSlotGroup(null);
        }}
      />
      {workspaceView === "groups" ? (
        <PostGroupsWorkspace
          channelId={channelId}
          channels={channels}
          initialGroupId={initialGroupId}
          newGroupRequested={newGroupRequested}
          onNewGroupRequestHandled={onNewGroupRequestHandled}
          onOpenPost={(post) => {
            changeWorkspaceView("posts");
            selectPost(post);
            onPostSelect(post.id);
          }}
        />
      ) : postView === "calendar" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.72fr)]">
          <Card className="min-w-0 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-white">
                  {monthLabel(calendarMonth, locale)}
                </h2>
                <p className="mt-1 text-sm text-neutral-400">
                  {t("telegram.posts.calendar.scheduledThrough", {
                    date: calendarData.data?.summary.lastScheduledAt
                      ? formatDate(calendarData.data.summary.lastScheduledAt, locale)
                      : t("telegram.posts.calendar.noScheduled"),
                  })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCalendarMonth((current) => addMonths(current, -1))
                  }
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900 hover:text-white"
                >
                  <ChevronRight size={16} className="rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = startOfMonth(new Date());
                    setCalendarMonth(today);
                    setSelectedCalendarDate(toLocalDateKey(new Date()));
                  }}
                  className="inline-flex h-10 items-center rounded-xl border border-neutral-800 bg-neutral-950 px-4 text-sm font-medium text-white transition hover:border-neutral-700 hover:bg-neutral-900"
                >
                  {t("telegram.posts.calendar.today")}
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarMonth((current) => addMonths(current, 1))}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900 hover:text-white"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    queryClient.invalidateQueries({
                      queryKey: ["telegram-managed-posts-calendar", channelId],
                    })
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 hover:text-white"
                >
                  <RefreshCw size={15} />
                  {t("common.refresh")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdSalesOverlay((current) => !current)}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition ${
                    showAdSalesOverlay
                      ? "border-blue-700 bg-blue-950/40 text-blue-100"
                      : "border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900 hover:text-white"
                  }`}
                >
                  <Layers3 size={15} />
                  {t("telegram.posts.calendar.adsOverlay")}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-[#1b1b1b]">
              <div className="min-w-[700px]">
                <div className="grid grid-cols-7 border-b border-neutral-800">
                  {calendarWeekdays(locale).map((day) => (
                    <div
                      key={day}
                      className="px-2 py-2 text-center text-[11px] font-medium text-neutral-400 sm:px-4 sm:py-3 sm:text-sm"
                    >
                      {day}
                    </div>
                  ))}
                </div>
                {calendarData.isLoading ? (
                  <div className="p-8">
                    <LoadingState />
                  </div>
                ) : (
                  <div className="grid grid-cols-7">
                    {calendarDays.map((day) => {
                      const dateKey = toLocalDateKey(day);
                      const items = calendarItemsByDay.get(dateKey) || [];
                      const scheduledCount = items.filter(
                        (item) => item.status === "SCHEDULED",
                      ).length;
                      const publishedCount = items.filter(
                        (item) => item.status === "PUBLISHED",
                      ).length;
                      const adItems = adCalendarItemsByDay.get(dateKey) || [];
                      const adReservedCount = adItems.filter(
                        (item) => item.existingPlacement?.status === "RESERVED",
                      ).length;
                      const adSoldCount = adItems.filter(
                        (item) =>
                          item.existingPlacement?.status === "SCHEDULED" ||
                          item.existingPlacement?.status === "PUBLISHED" ||
                          item.existingPlacement?.status === "COMPLETED",
                      ).length;
                      const isCurrentMonth = sameMonth(day, calendarMonth);
                      const isToday = dateKey === toLocalDateKey(new Date());
                      const isSelected = dateKey === selectedCalendarDate;
                      return (
                        <button
                          key={dateKey}
                          type="button"
                          onClick={() => setSelectedCalendarDate(dateKey)}
                          className={`min-h-[56px] border-b border-r border-neutral-800 px-2 py-1 text-left align-top transition sm:min-h-[72px] sm:px-2 sm:py-1.5 ${
                            isSelected
                              ? "bg-[#262626]"
                              : "bg-[#1f1f1f] hover:bg-[#252525]"
                          }`}
                        >
                          <div className="flex h-full flex-col">
                            <div className="mb-1 flex items-start justify-between">
                              <span
                                className={`text-[1.3rem] font-semibold leading-none sm:text-[1.75rem] ${
                                  isCurrentMonth ? "text-white" : "text-neutral-600"
                                }`}
                              >
                                {day.getDate()}
                              </span>
                              {isToday ? (
                                <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white sm:text-xs">
                                  {t("telegram.posts.calendar.today")}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 space-y-1 sm:space-y-1.5">
                              {scheduledCount ? (
                                <div className="whitespace-nowrap text-[9px] font-medium text-amber-300 sm:text-[10px]">
                                  {t("telegram.posts.calendar.scheduledShort", {
                                    count: scheduledCount,
                                  })}
                                </div>
                              ) : null}
                              {publishedCount ? (
                                <div className="whitespace-nowrap text-[9px] font-medium text-emerald-300 sm:text-[10px]">
                                  {t("telegram.posts.calendar.publishedShort", {
                                    count: publishedCount,
                                  })}
                                </div>
                              ) : null}
                              {showAdSalesOverlay && adReservedCount ? (
                                <div className="text-[10px] font-medium text-amber-300 sm:text-[11px]">
                                  {t("telegram.posts.calendar.adReserved", {
                                    count: adReservedCount,
                                  })}
                                </div>
                              ) : null}
                              {showAdSalesOverlay && adSoldCount ? (
                                <div className="text-[10px] font-medium text-sky-300 sm:text-[11px]">
                                  {t("telegram.posts.calendar.adSold", {
                                    count: adSoldCount,
                                  })}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </Card>
          <Card className="min-w-0 p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {selectedCalendarDateLabel}
                </h3>
                <p className="mt-1 text-sm text-neutral-400">
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {selectedCalendarItems.length ? (
                selectedCalendarItems.map((item) => (
                  <button
                    key={`${item.id}:${item.status}:${item.status === "SCHEDULED" ? item.scheduledAt : item.publishedAt}`}
                    type="button"
                    onClick={(event) => {
                      if (wantsNewTab(event)) {
                        window.open(
                          buildTelegramPostsUrl({
                            channelId,
                            postId: item.id,
                            postView: "editor",
                          }),
                          "_blank",
                          "noopener,noreferrer",
                        );
                        return;
                      }
                      changePostView("editor");
                      const post = posts.data?.find((entry) => entry.id === item.id);
                      if (post) {
                        selectPost(post);
                        onPostSelect(post.id);
                      }
                    }}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950/70 p-3 text-left transition hover:border-blue-700"
                  >
                    {(() => {
                      const linkedPost = posts.data?.find(
                        (entry) => entry.id === item.id,
                      );
                      const matchedSlot =
                        item.status === "SCHEDULED" && item.scheduledAt
                          ? calendarPresetSlotByTime.get(
                              localTimeKey(item.scheduledAt),
                            )
                          : undefined;
                      return (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {linkedPost?.icon ? (
                                <PostIcon
                                  iconId={linkedPost.icon}
                                  icon={linkedPost.iconPresentation}
                                  label={item.title}
                                  bare
                                />
                              ) : (
                                <span className="text-base leading-none">
                                  {calendarStatusIcon(item.status)}
                                </span>
                              )}
                              <div className="truncate text-sm font-medium text-white">
                                {item.title}
                              </div>
                              <ManagedPostTelegramIdentityIndicator post={item} />
                            </div>
                            <div className="mt-1 text-xs text-neutral-400">
                              {item.status === "SCHEDULED"
                                ? t("telegram.posts.editor.scheduled")
                                : t("telegram.posts.editor.published")}{" "}
                              ·{" "}
                              {timeLabel(
                                item.status === "SCHEDULED"
                                  ? item.scheduledAt
                                  : item.publishedAt,
                              )}
                            </div>
                            {matchedSlot ? (
                              <div className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-700/40 bg-emerald-950/30 px-2 py-1 text-[11px] text-emerald-200">
                                <span className="shrink-0">
                                  {(() => {
                                    const presentation = channelTimePosts.find(
                                      (slot) => slot.id === matchedSlot.id,
                                    )?.iconPresentation;
                                    return presentation?.type === "unicode"
                                      ? presentation.value
                                      : "⚡";
                                  })()}
                                </span>
                                <span className="truncate">
                                  {t("telegram.posts.calendar.slotMatch", {
                                    time: matchedSlot.time,
                                    title: matchedSlot.title,
                                  })}
                                </span>
                              </div>
                            ) : null}
                            {item.isAutoPlanned ? (
                              <div className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-blue-700/40 bg-blue-950/30 px-2 py-1 text-[11px] text-blue-200">
                                <Rocket size={12} />
                                <span className="truncate">
                                  {t("telegram.posts.calendar.importedPlan")}
                                </span>
                              </div>
                            ) : null}
                          </div>
                          {item.origin === "TELEGRAM" ? (
                            <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-1 text-[11px] font-medium whitespace-nowrap text-amber-200">
                              {t("telegram.posts.calendar.createdInTelegram")}
                            </span>
                          ) : null}
                        </div>
                      );
                    })()}
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-neutral-800 px-4 py-8 text-center text-sm text-neutral-500">
                  {t("telegram.posts.calendar.noPostsDay")}
                </div>
              )}
              {showAdSalesOverlay && selectedAdCalendarItems.length ? (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    <Layers3 size={14} />
                    {t("telegram.posts.calendar.adPlacements")}
                  </div>
                  {selectedAdCalendarItems.map((item) => {
                    const placement = item.existingPlacement;
                    const displayViews = placement
                      ? (placement.viewsCount ?? 0)
                      : item.expectedViews;
                    const displayPrice = placement
                      ? placement.agreedPrice
                      : item.recommendedPrice;
                    const displayCurrency = placement?.currency ?? item.currency;
                    return (
                      <div
                        key={`${item.channelId}:${item.scheduledAt}:${placement?.id ?? item.state}`}
                        className="rounded-xl border border-sky-800/50 bg-sky-950/20 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">
                              {placement?.advertiserName ||
                                placement?.title ||
                                (placement
                                  ? t(
                                      TELEGRAM_AD_PLACEMENT_STATUS_KEYS[
                                        placement.status
                                      ],
                                    )
                                  : t(
                                      "telegram.posts.calendar.unavailablePlacement",
                                    ))}
                            </p>
                            <p className="mt-1 text-xs text-neutral-300">
                              {timeLabel(item.scheduledAt)} ·{" "}
                              {t("telegram.posts.calendar.views", {
                                count: displayViews.toLocaleString(locale),
                              })}
                            </p>
                            {placement?.title &&
                            placement.title !== placement.advertiserName ? (
                              <p className="mt-1 text-xs text-neutral-400">
                                {placement.title}
                              </p>
                            ) : null}
                          </div>
                          <div className="text-right text-xs text-neutral-300">
                            <p>
                              {displayPrice} {displayCurrency}
                            </p>
                            {placement ? (
                              <p className="mt-1 text-neutral-500">
                                {t(
                                  TELEGRAM_AD_PLACEMENT_STATUS_KEYS[placement.status],
                                )}
                              </p>
                            ) : (
                              <p>
                                {t("telegram.posts.calendar.minimum", {
                                  amount: item.minimumPrice,
                                })}
                              </p>
                            )}
                          </div>
                        </div>
                        {!placement ? (
                          <p className="mt-2 text-xs text-neutral-400">
                            {t("telegram.posts.calendar.unavailablePlacement")}
                          </p>
                        ) : null}
                        {placement?.saleId ? (
                          <a
                            href={`/ad-sales?saleId=${placement.saleId}`}
                            className="mt-3 inline-flex text-xs font-medium text-blue-300 hover:text-blue-200"
                          >
                            {t("telegram.posts.calendar.openSale")}
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="hidden">
              <div>
                <h4 className="text-sm font-semibold text-white">
                  {t("telegram.posts.calendar.scheduleMultiple")}
                </h4>
                <p className="mt-1 text-xs text-neutral-400">
                  {t("telegram.posts.calendar.scheduleMultipleHint")}
                </p>
              </div>
              {!calendarSchedulablePosts.length ? (
                <div className="mt-4 rounded-xl border border-dashed border-neutral-800 px-4 py-5 text-sm text-neutral-500">
                  {t("telegram.posts.calendar.noDrafts")}
                </div>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(plannerFormats.data || []).map((format) => {
                      const selected = calendarPlannerFitFormatId === format.id;
                      return (
                        <Button
                          key={format.id}
                          variant={selected ? "primary" : "secondary"}
                          onClick={() => selectCalendarBatchFit(format.id, 0)}
                          disabled={
                            calendarBatchBusy ||
                            !plannerSlotsByFormatId.get(format.id)?.length
                          }
                          className={`h-9 px-3 ${
                            selected
                              ? "ring-1 ring-blue-300/60"
                              : "border-neutral-700 bg-neutral-900 hover:border-blue-700 hover:bg-blue-950/25"
                          }`}
                        >
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            {selected ? (
                              <CheckCircle2 size={14} />
                            ) : (
                              <span className="text-neutral-400">
                                {format.icon || "◌"}
                              </span>
                            )}
                            <span className="truncate">{format.name}</span>
                          </span>
                        </Button>
                      );
                    })}
                    <Button
                      variant="primary"
                      onClick={() => selectCalendarBatchFit(null, 0)}
                      disabled={
                        calendarBatchBusy ||
                        !availableCalendarScheduleSlots.length ||
                        !canUsePlannerFormatSlots
                      }
                      className="h-9 px-3"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <ListPlus size={15} />
                        {t("telegram.posts.calendar.selectFit")}
                      </span>
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        selectCalendarBatchFit(
                          calendarPlannerFitFormatId,
                          calendarPlannerFitRerollOffset + 1,
                        )
                      }
                      disabled={
                        calendarBatchBusy ||
                        !canUsePlannerFormatSlots ||
                        (!calendarPlannerFitFormatId &&
                          !calendarBatchSelectedPostIds.length)
                      }
                      className="h-9 border-amber-800/60 bg-amber-950/25 px-3 text-amber-100 hover:bg-amber-900/35 disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-500"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <RotateCcw size={15} />
                        {t("telegram.posts.calendar.reroll")}
                      </span>
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={clearCalendarBatchSelection}
                      disabled={
                        calendarBatchBusy || !calendarBatchSelectedPostIds.length
                      }
                      className="h-9 border-neutral-700 bg-neutral-950 px-3 text-neutral-300 hover:border-red-800 hover:bg-red-950/30 hover:text-red-100"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <X size={15} />
                        {t("common.clear")}
                      </span>
                    </Button>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-neutral-500">
                        {t("telegram.posts.calendar.postsToSchedule")}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {t("telegram.posts.calendar.selected", {
                          count: calendarBatchSelectedPosts.length,
                        })}
                      </div>
                    </div>
                    <Input
                      value={calendarPostSearch}
                      onChange={(event) => setCalendarPostSearch(event.target.value)}
                      placeholder={t("telegram.posts.calendar.searchPostsGroups")}
                    />
                    {!calendarFilteredSchedulablePosts.length ? (
                      <div className="rounded-xl border border-dashed border-neutral-800 px-4 py-5 text-sm text-neutral-500">
                        {t("telegram.posts.calendar.noSearchMatches")}
                      </div>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-neutral-800 p-2">
                        {calendarGroupedSchedulablePosts.groups.map((section) => (
                          <CalendarPostGroupSection
                            key={section.group.id}
                            title={telegramPostGroupTitle(section.group, t)}
                            count={section.posts.length}
                            icon={
                              <PostIcon
                                iconId={section.group.icon}
                                icon={section.group.iconPresentation}
                                label={telegramPostGroupTitle(section.group, t)}
                                bare
                              />
                            }
                          >
                            {section.posts.map((post) => {
                              const selected = calendarBatchSelectedPostIds.includes(
                                post.id,
                              );
                              return (
                                <div
                                  key={post.id}
                                  onClick={(event) => {
                                    if (
                                      !wantsNewTab(event) ||
                                      shouldIgnoreModifiedPostOpen(event.target)
                                    ) {
                                      return;
                                    }
                                    event.preventDefault();
                                    openPostInNewTab(post);
                                  }}
                                  className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                                    selected
                                      ? "border-blue-700 bg-blue-950/20"
                                      : "border-neutral-800 bg-neutral-950/40 hover:border-neutral-700"
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleCalendarBatchPostSelection(post.id)
                                    }
                                    aria-pressed={selected}
                                    aria-label={
                                      selected
                                        ? t("telegram.posts.editor.unselectNamed", {
                                            title: post.title,
                                          })
                                        : t("telegram.posts.editor.selectNamed", {
                                            title: post.title,
                                          })
                                    }
                                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                                      selected
                                        ? "border-blue-500 bg-blue-500 text-white"
                                        : "border-neutral-700 text-neutral-500"
                                    }`}
                                  >
                                    {selected ? "✓" : ""}
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      {post.icon ? (
                                        <PostIcon
                                          iconId={post.icon}
                                          icon={post.iconPresentation}
                                          label={post.title}
                                          bare
                                        />
                                      ) : (
                                        <span className="text-sm leading-none">
                                          📝
                                        </span>
                                      )}
                                      <span className="truncate text-sm font-medium text-white">
                                        {post.title}
                                      </span>
                                    </div>
                                    <div className="mt-1 text-xs text-neutral-500">
                                      {post.status === "FAILED"
                                        ? t("telegram.posts.calendar.failed")
                                        : t("telegram.posts.calendar.draft")}{" "}
                                      ·{" "}
                                      {t("telegram.posts.created", {
                                        date: formatDate(post.createdAt, locale),
                                      })}
                                    </div>
                                    {selected ? (
                                      <CalendarPostTimePicker
                                        post={post}
                                        selectedCalendarDate={selectedCalendarDate}
                                        availableCalendarScheduleSlots={
                                          availableCalendarScheduleSlots
                                        }
                                        calendarScheduleSlots={calendarScheduleSlots}
                                        channelId={channelId}
                                        channelTimePosts={channelTimePosts}
                                        selectedPostIds={calendarBatchSelectedPostIds}
                                        timeChoiceByPostId={
                                          calendarBatchTimeChoiceByPostId
                                        }
                                        customTimeByPostId={
                                          calendarBatchCustomTimeByPostId
                                        }
                                        onTimeChoiceChange={
                                          setCalendarBatchTimeChoiceByPostId
                                        }
                                        onCustomTimeChange={
                                          setCalendarBatchCustomTimeByPostId
                                        }
                                      />
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </CalendarPostGroupSection>
                        ))}
                        {calendarGroupedSchedulablePosts.ungrouped.map((post) => {
                          const selected = calendarBatchSelectedPostIds.includes(
                            post.id,
                          );
                          return (
                            <div
                              key={post.id}
                              onClick={(event) => {
                                if (
                                  !wantsNewTab(event) ||
                                  shouldIgnoreModifiedPostOpen(event.target)
                                ) {
                                  return;
                                }
                                event.preventDefault();
                                openPostInNewTab(post);
                              }}
                              className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                                selected
                                  ? "border-blue-700 bg-blue-950/20"
                                  : "border-neutral-800 bg-neutral-950/40 hover:border-neutral-700"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  toggleCalendarBatchPostSelection(post.id)
                                }
                                aria-pressed={selected}
                                aria-label={
                                  selected
                                    ? t("telegram.posts.editor.unselectNamed", {
                                        title: post.title,
                                      })
                                    : t("telegram.posts.editor.selectNamed", {
                                        title: post.title,
                                      })
                                }
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                                  selected
                                    ? "border-blue-500 bg-blue-500 text-white"
                                    : "border-neutral-700 text-neutral-500"
                                }`}
                              >
                                {selected ? "✓" : ""}
                              </button>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  {post.icon ? (
                                    <PostIcon
                                      iconId={post.icon}
                                      icon={post.iconPresentation}
                                      label={post.title}
                                      bare
                                    />
                                  ) : (
                                    <span className="text-sm leading-none">📝</span>
                                  )}
                                  <span className="truncate text-sm font-medium text-white">
                                    {post.title}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-neutral-500">
                                  {post.status === "FAILED"
                                    ? t("telegram.posts.calendar.failed")
                                    : t("telegram.posts.calendar.draft")}{" "}
                                  ·{" "}
                                  {t("telegram.posts.created", {
                                    date: formatDate(post.createdAt, locale),
                                  })}
                                </div>
                                {selected ? (
                                  <CalendarPostTimePicker
                                    post={post}
                                    selectedCalendarDate={selectedCalendarDate}
                                    availableCalendarScheduleSlots={
                                      availableCalendarScheduleSlots
                                    }
                                    calendarScheduleSlots={calendarScheduleSlots}
                                    channelId={channelId}
                                    channelTimePosts={channelTimePosts}
                                    selectedPostIds={calendarBatchSelectedPostIds}
                                    timeChoiceByPostId={
                                      calendarBatchTimeChoiceByPostId
                                    }
                                    customTimeByPostId={
                                      calendarBatchCustomTimeByPostId
                                    }
                                    onTimeChoiceChange={
                                      setCalendarBatchTimeChoiceByPostId
                                    }
                                    onCustomTimeChange={
                                      setCalendarBatchCustomTimeByPostId
                                    }
                                  />
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-neutral-500">
                        {t("telegram.posts.calendar.schedulePreview")}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {t("telegram.posts.calendar.willBeScheduled", {
                          assigned: calendarBatchPlan.assignments.length,
                          selected: calendarBatchSelectedPostIds.length,
                        })}
                      </div>
                    </div>
                    {calendarBatchPlan.assignments.length ? (
                      <div className="mt-3 space-y-2">
                        {calendarBatchPlan.assignments.map((assignment) => {
                          const post = calendarSchedulablePostsById.get(
                            assignment.postId,
                          );
                          const slot = calendarScheduleSlots.find(
                            (item) => item.scheduledAt === assignment.scheduledAt,
                          );
                          const title = post?.title || assignment.postId;
                          return (
                            <button
                              type="button"
                              key={`${assignment.postId}:${assignment.scheduledAt}`}
                              disabled={!post}
                              onClick={(event) => {
                                if (post) openPostWithModifier(post, event);
                              }}
                              className="flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-800 px-3 py-2 text-left text-sm transition hover:border-neutral-700 hover:bg-neutral-900/70 disabled:cursor-default disabled:hover:border-neutral-800 disabled:hover:bg-transparent"
                              title={
                                post ? t("telegram.posts.calendar.openPost") : title
                              }
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {post?.icon ? (
                                  <PostIcon
                                    iconId={post.icon}
                                    icon={post.iconPresentation}
                                    label={post.title}
                                    bare
                                    size="xs"
                                  />
                                ) : (
                                  <span
                                    aria-hidden="true"
                                    className="shrink-0 text-sm"
                                  >
                                    📝
                                  </span>
                                )}
                                <span className="min-w-0 truncate text-white">
                                  {title}
                                </span>
                              </div>
                              <div className="shrink-0 text-right text-xs text-neutral-400">
                                <div>
                                  {slot?.time || timeLabel(assignment.scheduledAt)}
                                </div>
                                <div className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                                  {slot?.source === "custom"
                                    ? t("telegram.posts.calendar.custom")
                                    : t("telegram.posts.calendar.slot")}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-neutral-500">
                        {t("telegram.posts.calendar.assignHint")}
                      </div>
                    )}
                    {calendarBatchPlan.invalidPostIds.length ? (
                      <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                        {t("telegram.posts.calendar.invalidAssignments", {
                          count: calendarBatchPlan.invalidPostIds.length,
                        })}
                      </div>
                    ) : null}
                    {calendarBatchPlan.duplicatePostIds.length ? (
                      <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                        {t("telegram.posts.calendar.duplicateAssignments", {
                          count: calendarBatchPlan.duplicatePostIds.length,
                        })}
                      </div>
                    ) : null}
                    <div className="mt-4 flex justify-end">
                      <Button
                        onClick={scheduleCalendarBatch}
                        disabled={
                          calendarBatchBusy || !calendarBatchPlan.assignments.length
                        }
                      >
                        {calendarBatchBusy
                          ? t("telegram.posts.calendar.scheduling")
                          : t("telegram.posts.calendar.scheduleCount", {
                              count: calendarBatchPlan.assignments.length,
                            })}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(270px,0.7fr)_minmax(420px,1.25fr)_minmax(280px,0.72fr)]">
          <TelegramPostPreview
            channelTitle={channelTitle}
            channelPhotoUrl={channelPhotoUrl}
            text={text}
            formattedHtml={isReadOnlyTelegramPost ? editingMeta?.formattedText : null}
            customEmojiPacks={customEmojiPacks.data?.packs}
            imageUrls={
              isReadOnlyTelegramPost ? (editingMeta?.imageUrls ?? []) : imageUrls
            }
            hasMedia={editingMeta?.hasMedia}
            engagement={editingMeta?.engagementMetrics}
            buttonRows={buttonRows}
            onTextChange={
              isReadOnlyTelegramPost
                ? null
                : (nextValue) => {
                    if (textEditorRef.current) {
                      textEditorRef.current.commitExternalChange(nextValue);
                      return;
                    }
                    setText(nextValue);
                  }
            }
            onUndo={
              isReadOnlyTelegramPost ? null : () => textEditorRef.current?.undo()
            }
            onRedo={
              isReadOnlyTelegramPost ? null : () => textEditorRef.current?.redo()
            }
            longTextMode={longTextMode}
            captionLengthMax={effectiveCaptionLengthMax}
            messageLengthMax={effectiveMessageLengthMax}
          />
          <Card className="relative min-w-0 space-y-3 overflow-visible">
            {editorIsSaving ? (
              <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-black/55 backdrop-blur-[2px]">
                <div className="flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900 px-5 py-4 text-sm font-medium text-white shadow-2xl">
                  <LoaderCircle size={21} className="animate-spin text-blue-400" />
                  {t("telegram.posts.editor.savingNamed", {
                    title: editing?.title || title,
                  })}
                </div>
              </div>
            ) : null}
            {isReadOnlyTelegramPost && editingMeta ? (
              <div className="absolute inset-0 z-50 rounded-lg bg-neutral-900 p-4">
                <ManagedPostReadOnlyPanel
                  title={editingMeta.title}
                  telegramUrl={editingMeta.primaryTelegramMessageUrl}
                />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <IconPicker
                    key={iconPickerGeneration}
                    iconId={icon}
                    onChange={changePostIcon}
                    onPendingChange={setIconPending}
                    buttonLabel={t("telegram.posts.icon.addIcon")}
                    compact
                    className="!h-8 !w-8"
                  />
                  <h2 className="text-lg font-semibold text-white">
                    {isPublished
                      ? t("telegram.posts.editor.publishedPost")
                      : editing
                        ? t("telegram.posts.editor.editPost")
                        : t("telegram.posts.newPost")}
                  </h2>
                  {editing && incomingInternalLinkPosts.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setUsageModalOpen(true)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 text-xs font-medium text-neutral-300 transition hover:border-blue-600 hover:bg-blue-950/30 hover:text-white"
                      title={t("telegram.posts.editor.showLinks")}
                    >
                      <Layers3 size={13} />
                      {t("telegram.posts.groups.usedInPosts")}
                      <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-200">
                        {incomingInternalLinkPosts.length}
                      </span>
                    </button>
                  ) : null}
                  {editingMeta ? (
                    <ManagedPostTelegramLink
                      channelId={channelId}
                      post={editingMeta}
                      canManage={canManageTelegramLink}
                      onPostUpdated={(post) => {
                        setEditing(post);
                        if (post.status === "DRAFT") changeStatusTab("DRAFT");
                      }}
                    />
                  ) : null}
                  {editing && canReturnScheduledPostToDraft ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="inline-flex h-8 items-center gap-1.5 px-2.5 text-xs"
                      disabled={editorIsSaving || returnManagedPostToDraft.isPending}
                      onClick={() => void returnManagedPostToDraft.mutateAsync()}
                    >
                      <RotateCcw size={13} />
                      {returnManagedPostToDraft.isPending
                        ? t("telegram.posts.editor.returning")
                        : t("telegram.posts.editor.returnDraft")}
                    </Button>
                  ) : null}
                </div>
                {isPublished ? (
                  <div className="mt-0.5 space-y-0.5 text-xs">
                    <p className="flex items-center gap-1.5 text-emerald-300">
                      <CheckCircle2 size={13} />
                      {t("telegram.posts.editor.publishedEditable")}
                    </p>
                    <p className="text-neutral-400">
                      {publishModeLabel(
                        t,
                        editing?.publishMode,
                        editing?.imageUrls.length || 0,
                        editing?.text?.length || 0,
                      )}
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="w-full sm:w-56">
                <CustomSelect
                  value={postGroupId || ""}
                  onChange={changePostGroup}
                  placeholder={t("telegram.posts.editor.noGroup")}
                  options={[
                    {
                      value: "",
                      label: t("telegram.posts.editor.noGroup"),
                      iconEmoji: "📂",
                    },
                    ...(postGroups.data || []).map((group) => {
                      return {
                        value: group.id,
                        label: telegramPostGroupTitle(group, t),
                        ...selectIconProps(group.iconPresentation),
                        iconFallback: telegramPostGroupTitle(group, t),
                      };
                    }),
                  ]}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.25fr)_minmax(220px,0.75fr)]">
              <FormField label={t("telegram.posts.editor.title")} required>
                <Input
                  value={title}
                  disabled={busy}
                  onChange={(event) => {
                    setTitleManuallyEdited(true);
                    setTitle(event.target.value);
                  }}
                />
              </FormField>
              <FormField label={t("telegram.posts.editor.member")}>
                <MemberSelect
                  value={assignedMemberId}
                  onChange={(value) => {
                    setMemberSelectionTouched(true);
                    setAssignedMemberId(value || null);
                  }}
                  defaultToCurrent={!editing}
                  disabled={busy}
                />
              </FormField>
            </div>
            <FormField label={t("telegram.posts.editor.text")}>
              <TelegramTextEditor
                ref={textEditorRef}
                value={text}
                onChange={setText}
                disabled={busy}
                rows={7}
                channelId={channelId}
                currentPostId={editing?.id}
                enableInternalPostLinks
                internalLinkUsage="edit"
                internalLinkScheduledAt={internalLinkScheduledAt}
                highlightInternalLinkTargetId={highlightedInternalLinkTargetId}
                highlightRequestKey={highlightRequestKey}
                availableInternalPosts={posts.data || []}
                enableCustomEmoji
                customEmojiPacks={customEmojiPacks.data?.packs}
                onManageCustomEmojiPacks={() => setCustomEmojiPacksOpen(true)}
                buttonRows={buttonRows}
                onButtonRowsChange={setButtonRows}
                canPublishInlineButtons={Boolean(
                  channelPublishingCapabilities?.canPublishInlineButtons,
                )}
                onCheckInlineButtonPublishingAccess={
                  checkInlineButtonPublishingAccess
                }
              />
            </FormField>
            <ManagedPostInternalLinksNotice
              links={outgoingInternalLinks}
              channelTelegramChatId={channelTelegramChatId}
              allowUnresolved={effectivePublishingMode === "schedule"}
              onHighlightTarget={highlightInternalLinkTarget}
              onOpenPostInNewTab={openPostInNewTab}
            />
            {!isPublished || imageUrls.length ? (
              <div className="space-y-2">
                <TelegramImageUpload
                  value={imageUrls}
                  onChange={setImageUrls}
                  disabled={busy || hasLockedTelegramMedia}
                  readOnly={hasLockedTelegramMedia}
                  onUploadingChange={setUploadingImages}
                />
                {hasLockedTelegramMedia ? (
                  <p className="text-xs text-amber-300">
                    {t("telegram.posts.editor.imagesLocked")}
                  </p>
                ) : null}
              </div>
            ) : null}
            {publishedLongImageTextMode ? (
              <LongImageTextModePanel
                mode={publishedLongImageTextMode}
                readOnly
                textLength={text.length}
              />
            ) : null}
            {!isPublished && hasLongImageText ? (
              <LongImageTextModePanel
                mode={longTextMode}
                onChange={setLongTextMode}
                textLength={text.length}
              />
            ) : null}
            {!isPublished && hasLongTextOnly ? (
              <div className="rounded-lg border border-blue-700/60 bg-blue-950/20 p-3">
                <p className="text-sm text-blue-200">
                  {t("telegram.posts.editor.longTextOnly", {
                    length: text.length,
                    count: Math.ceil(text.length / effectiveMessageLengthMax),
                  })}
                </p>
              </div>
            ) : null}
            {!isPublished ? (
              <FormField label={t("telegram.posts.editor.publishingMode")}>
                <CustomSelect
                  value={mode}
                  dropdownDirection="up"
                  searchable={false}
                  onChange={(value) => setMode(value as PublishingMode)}
                  options={[
                    {
                      value: "draft",
                      label: t("telegram.posts.editor.saveDraft"),
                      iconEmoji: "📝",
                    },
                    {
                      value: "publish",
                      label: t("telegram.posts.editor.publishNow"),
                      iconEmoji: "🚀",
                    },
                    {
                      value: "schedule",
                      label: managedPostScheduleUi({
                        hasInlineButtons: buttonRows.length > 0,
                        t,
                      }).label,
                      iconEmoji: "🕒",
                    },
                  ]}
                />
              </FormField>
            ) : null}
            {!isPublished && mode === "schedule" ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label={t("telegram.posts.editor.publishDate")} required>
                    <DateInput
                      value={scheduleDate}
                      onChange={(event) => setScheduleDate(event.target.value)}
                      placeholder={t("telegram.posts.editor.selectDate")}
                    />
                  </FormField>
                  <FormField label={t("telegram.posts.editor.publishTime")} required>
                    <TimeInput
                      value={scheduleTime}
                      onChange={(event) => setScheduleTime(event.target.value)}
                    />
                  </FormField>
                </div>
                {channelTimePosts.length ? (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                      {t("telegram.posts.time.menu")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {channelTimePosts.map((timePost) => (
                        <button
                          key={timePost.id}
                          type="button"
                          onClick={() => applyChannelTimePost(timePost)}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm text-white transition ${
                            selectedTimePostId === timePost.id
                              ? "border-blue-500 bg-blue-950/25 ring-1 ring-blue-400"
                              : "border-neutral-700 bg-neutral-950 hover:border-blue-600 hover:bg-blue-950/20"
                          }`}
                        >
                          <IconAvatar
                            icon={timePost.iconPresentation}
                            label={timePost.title}
                            size="xs"
                            bordered
                          />
                          <span className="min-w-0">
                            {timePost.title ? (
                              <span className="block truncate text-xs text-neutral-300">
                                {timePost.title}
                              </span>
                            ) : null}
                            <span className="block text-sm font-medium text-white">
                              {timePost.time}
                            </span>
                          </span>
                        </button>
                      ))}
                      <AddTimePostButton
                        channelId={channelId}
                        timePosts={channelTimePosts}
                        presentation="editor"
                      />
                    </div>
                  </div>
                ) : (
                  <AddTimePostButton
                    channelId={channelId}
                    timePosts={channelTimePosts}
                    presentation="editor"
                  />
                )}
              </div>
            ) : null}
            {pendingPostSaves.length + savingPostIds.length > 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-blue-800/70 bg-blue-950/20 px-3 py-2 text-xs text-blue-200">
                <LoaderCircle size={14} className="animate-spin" />
                {t("telegram.posts.calendar.savingBackground", {
                  count: pendingPostSaves.length + savingPostIds.length,
                })}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              {editing ? (
                <button
                  type="button"
                  title={t("telegram.posts.editor.history")}
                  aria-label={t("telegram.posts.editor.openHistory")}
                  onClick={() => setHistoryOpen(true)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-300 transition hover:border-blue-600 hover:bg-blue-950/30 hover:text-white"
                >
                  <History size={17} />
                </button>
              ) : null}
              <Button
                onClick={run}
                disabled={!!publishDisabledReason || dependencyPublishBlocked}
              >
                {publishedPostNeedsRepublish
                  ? t("telegram.posts.editor.publish")
                  : isPublished
                    ? t("telegram.posts.editor.updateText")
                    : mode === "draft"
                      ? t("telegram.posts.editor.saveDraftAction")
                      : mode === "publish"
                        ? t("telegram.posts.editor.publishNow")
                        : editing?.status === "SCHEDULED"
                          ? t("telegram.posts.editor.updateScheduled")
                          : t("telegram.posts.editor.schedulePost")}
              </Button>
            </div>
            {publishDisabledReason ? (
              <p className="text-right text-xs text-neutral-500">
                {publishDisabledReason}
              </p>
            ) : null}
            {dependencyPublishBlocked && !publishDisabledReason ? (
              <p className="text-right text-xs text-amber-400">
                {t("telegram.posts.editor.publishDependenciesFirst")}
              </p>
            ) : null}
            {editing && usageModalOpen ? (
              <PostUsageModal
                post={editing}
                usages={incomingInternalLinkPosts}
                onClose={() => setUsageModalOpen(false)}
                onOpenPost={(post) => {
                  setUsageModalOpen(false);
                  openPost(post);
                }}
                onOpenPostInNewTab={(post) => {
                  openPostInNewTab(post);
                }}
              />
            ) : null}
            {editing ? (
              <ManagedPostHistoryModal
                open={historyOpen}
                channelId={channelId}
                postId={editing.id}
                restorePending={restorePostRevision.isPending}
                onClose={() => setHistoryOpen(false)}
                onRestore={(revision) => {
                  setHistoryOpen(false);
                  setRestorePreviewRevision(revision);
                  setRestoreConfirmationValue("");
                }}
              />
            ) : null}
          </Card>

          <Card className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-white">
                {t("telegram.posts.editor.posts")}
              </h2>
              <span className="text-xs text-neutral-500">
                {t("telegram.posts.total", {
                  count: (posts.data?.length || 0) + pendingPostSaves.length,
                })}
              </span>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
              {(
                [
                  {
                    value: "DRAFT",
                    label: t("telegram.posts.editor.drafts"),
                    icon: FileText,
                    count: (posts.data || []).filter(
                      (post) =>
                        ["DRAFT", "FAILED", "PUBLISHING"].includes(post.status) ||
                        isBrokenPublishedPost(post),
                    ).length,
                  },
                  {
                    value: "SCHEDULED",
                    label: t("telegram.posts.editor.scheduled"),
                    icon: Clock3,
                    count: (posts.data || []).filter(
                      (post) => post.status === "SCHEDULED",
                    ).length,
                  },
                  {
                    value: "PUBLISHED",
                    label: t("telegram.posts.editor.published"),
                    icon: CheckCircle2,
                    count: (posts.data || []).filter(
                      (post) =>
                        post.status === "PUBLISHED" && !isBrokenPublishedPost(post),
                    ).length,
                  },
                ] as const
              ).map(({ value, label, icon: StatusIcon, count }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  aria-label={label}
                  onClick={() => changeStatusTab(value)}
                  className={`relative flex h-9 items-center justify-center rounded-md transition ${
                    statusTab === value
                      ? "bg-blue-600 text-white"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                  }`}
                >
                  <StatusIcon size={17} />
                  {count ? (
                    <span className="absolute right-1.5 top-1 rounded-full bg-neutral-950/70 px-1 text-[9px] leading-4">
                      {count}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <ManagedPostSearchInput value={postSearch} onChange={setPostSearch} />
            {posts.isLoading ? <LoadingState /> : null}
            {visiblePosts.length || visiblePendingPostSaves.length ? (
              <>
                <div className="max-h-[calc(100vh-15rem)] space-y-2 overflow-y-auto pr-1">
                  {groupedPendingPostSaves.ungrouped.map((pending) => (
                    <PendingPostRow key={pending.id} pending={pending} />
                  ))}
                  {orderedSidebarSections.map((section) => {
                    const collapsed =
                      section.group && collapsedGroupIds.includes(section.group.id);
                    const statusNumberingEnabled = Boolean(
                      section.group?.statusNumberingEnabled,
                    );
                    const sectionReadOnly = section.posts.some(
                      (post) => post.readOnlyTelegramPost,
                    );
                    const sectionPostIds = section.posts.map((post) => post.id);
                    const allSectionSelected = sectionPostIds.every((id) =>
                      selectedPostIds.includes(id),
                    );
                    return (
                      <div
                        key={section.key}
                        draggable={!sectionReadOnly}
                        onDragStart={() => {
                          if (!sectionReadOnly) setDraggedSidebarKey(section.key);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          if (
                            !draggedSidebarKey ||
                            draggedSidebarKey === section.key
                          ) {
                            return;
                          }
                          setSidebarOrderKeys((currentKeys) => {
                            const current = currentKeys.length
                              ? currentKeys
                              : orderedSidebarSections.map((item) => item.key);
                            const from = current.indexOf(draggedSidebarKey);
                            const to = current.indexOf(section.key);
                            if (from < 0 || to < 0) return current;
                            const next = [...current];
                            const [moved] = next.splice(from, 1);
                            next.splice(to, 0, moved);
                            return next;
                          });
                        }}
                        onDragEnd={() => {
                          if (sectionReadOnly) return;
                          setDraggedSidebarKey(null);
                          scheduleSidebarOrderSave(
                            orderedSidebarSections.map((item) => item.key),
                          );
                        }}
                        className={`${
                          section.group
                            ? "overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/40"
                            : "space-y-2"
                        } ${draggedSidebarKey === section.key ? "border-blue-500 opacity-60" : ""}`}
                      >
                        {section.group ? (
                          <div className="flex items-center gap-2 border-b border-neutral-800 px-2 py-2">
                            {!sectionReadOnly ? (
                              <GripVertical
                                size={15}
                                className="shrink-0 cursor-grab text-neutral-500"
                              />
                            ) : null}
                            <button
                              type="button"
                              onClick={() => toggleGroupCollapsed(section.group!.id)}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              {collapsed ? (
                                <ChevronRight
                                  size={15}
                                  className="shrink-0 text-neutral-400"
                                />
                              ) : (
                                <ChevronDown
                                  size={15}
                                  className="shrink-0 text-neutral-400"
                                />
                              )}
                              <PostIcon
                                iconId={section.group.icon}
                                icon={section.group.iconPresentation}
                                label={telegramPostGroupTitle(section.group, t)}
                                bare
                              />
                              <span className="truncate text-sm font-medium text-white">
                                {telegramPostGroupTitle(section.group, t)}
                              </span>
                              <span className="text-xs text-neutral-500">
                                {section.posts.length + section.pendingPosts.length}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedPostIds((current) =>
                                  allSectionSelected
                                    ? current.filter(
                                        (id) => !sectionPostIds.includes(id),
                                      )
                                    : [...new Set([...current, ...sectionPostIds])],
                                )
                              }
                              className="shrink-0 rounded-md px-2 py-1 text-[11px] text-blue-300 hover:bg-blue-950/60"
                            >
                              {allSectionSelected
                                ? t("telegram.posts.editor.clear")
                                : t("telegram.posts.editor.selectAllAction")}
                            </button>
                          </div>
                        ) : null}
                        {!collapsed ? (
                          <div
                            className={section.group ? "space-y-2 p-2" : "space-y-2"}
                          >
                            {section.posts.map((post) => {
                              const isSaving = savingPostIds.includes(post.id);
                              const isSelected = selectedPostIds.includes(post.id);
                              const isOpen = editing?.id === post.id;
                              const displayNumber = section.group
                                ? getManagedPostDisplayNumber(
                                    post,
                                    statusNumberingEnabled,
                                  )
                                : null;
                              return (
                                <div
                                  key={post.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={(event) => {
                                    if (wantsNewTab(event)) {
                                      cancelScheduledPostOpen();
                                      openPostInNewTab(post);
                                      return;
                                    }
                                    if (event.shiftKey || event.detail > 1) {
                                      cancelScheduledPostOpen();
                                      togglePostSelected(post.id);
                                      return;
                                    }
                                    schedulePostOpen(post);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      cancelScheduledPostOpen();
                                      openPost(post);
                                    } else if (event.key === " ") {
                                      event.preventDefault();
                                      cancelScheduledPostOpen();
                                      togglePostSelected(post.id);
                                    }
                                  }}
                                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 outline-none transition ${
                                    isOpen && isSelected
                                      ? "border-blue-400 bg-blue-950/30 ring-1 ring-amber-300/50"
                                      : isOpen
                                        ? "border-blue-400 bg-blue-950/25"
                                        : isSelected
                                          ? "border-amber-400 bg-amber-950/20"
                                          : "border-neutral-800 hover:bg-neutral-900"
                                  }`}
                                >
                                  {!section.group ? (
                                    post.readOnlyTelegramPost ? null : (
                                      <GripVertical
                                        size={15}
                                        className="shrink-0 cursor-grab text-neutral-500"
                                      />
                                    )
                                  ) : null}
                                  <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                    {isSaving ? (
                                      <LoaderCircle
                                        size={16}
                                        className="shrink-0 animate-spin text-blue-400"
                                      />
                                    ) : !post.icon ? (
                                      <PostStatusIcon status={post.status} />
                                    ) : null}
                                    {displayNumber != null ? (
                                      <span className="shrink-0">
                                        <span className="sr-only">
                                          {statusNumberingEnabled
                                            ? t("telegram.posts.calendar.status")
                                            : t("telegram.posts.calendar.group")}{" "}
                                          {t("telegram.posts.editor.number", {
                                            number: displayNumber,
                                          })}
                                        </span>
                                        <span
                                          aria-hidden="true"
                                          className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 px-1.5 text-[11px] font-medium tabular-nums text-neutral-300"
                                        >
                                          {displayNumber}
                                        </span>
                                      </span>
                                    ) : null}
                                    <span className="min-w-0 flex-1">
                                      <span className="flex min-w-0 items-center gap-1.5 text-sm">
                                        <PostIcon
                                          iconId={post.icon}
                                          icon={post.iconPresentation}
                                          label={post.title}
                                          bare
                                        />
                                        <span className="truncate">{post.title}</span>
                                        <ManagedPostTelegramIdentityIndicator
                                          post={post}
                                        />
                                        {post.readOnlyTelegramPost ? (
                                          <span className="shrink-0 rounded border border-sky-800 bg-sky-950/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-sky-300">
                                            {t("telegram.posts.status.synced")}
                                          </span>
                                        ) : null}
                                        {post.telegramIdVerificationStatus !==
                                          "MISSING" &&
                                        ["BROKEN", "MISSING"].includes(
                                          post.telegramRemoteStatus,
                                        ) ? (
                                          <AlertTriangle
                                            size={13}
                                            className="shrink-0 text-red-400"
                                            aria-label={t(
                                              remoteStatusKey(
                                                post.telegramRemoteStatus,
                                              ),
                                            )}
                                          />
                                        ) : null}
                                      </span>
                                      {post.status !== "DRAFT" ? (
                                        <span className="block truncate text-[11px] text-neutral-500">
                                          {post.status === "SCHEDULED" &&
                                          post.scheduledAt
                                            ? formatDateTime(post.scheduledAt, locale)
                                            : post.status === "PUBLISHED" &&
                                                post.publishedAt
                                              ? formatDateTime(
                                                  post.publishedAt,
                                                  locale,
                                                )
                                              : t(managedPostStatusKey(post.status))}
                                        </span>
                                      ) : null}
                                    </span>
                                  </div>
                                  {!post.readOnlyTelegramPost ? (
                                    <button
                                      type="button"
                                      title={t("telegram.posts.editor.moveToChannel")}
                                      aria-label={t(
                                        "telegram.posts.editor.moveNamed",
                                        {
                                          title: post.title,
                                        },
                                      )}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        cancelScheduledPostOpen();
                                        setMovingPost(post);
                                      }}
                                      className="cursor-pointer rounded-md border border-neutral-700 p-1.5 text-neutral-300 hover:bg-neutral-800"
                                    >
                                      <MoveRight size={14} />
                                    </button>
                                  ) : null}
                                  {!post.readOnlyTelegramPost ? (
                                    <button
                                      type="button"
                                      aria-label={t(
                                        "telegram.posts.editor.deleteNamed",
                                        {
                                          title: post.title,
                                        },
                                      )}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        cancelScheduledPostOpen();
                                        setDeletingPost(post);
                                      }}
                                      className="cursor-pointer rounded-md border border-red-800 p-1.5 text-red-300 hover:bg-red-950"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })}
                            {section.pendingPosts.map((pending) => (
                              <PendingPostRow key={pending.id} pending={pending} />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/70 px-2 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleAllChannelPosts}
                      className="rounded-md px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
                      title={t("telegram.posts.editor.selectAll")}
                    >
                      {allChannelPostsSelected
                        ? t("telegram.posts.editor.clearAll")
                        : t("telegram.posts.editor.all")}
                    </button>
                    <span
                      className={`min-w-9 rounded-md border px-2 py-1 text-center text-xs ${
                        selectedPosts.length
                          ? "border-amber-500/40 bg-amber-950/20 text-amber-200"
                          : "border-transparent text-transparent"
                      }`}
                    >
                      {selectedPosts.length || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <ManagedPostExportButton posts={selectedPosts} />
                    <Button
                      type="button"
                      variant="danger"
                      disabled={
                        !selectedPosts.length ||
                        busy ||
                        selectedPosts.some((post) => post.readOnlyTelegramPost)
                      }
                      onClick={() => setBulkDeleteOpen(true)}
                      title={
                        selectedPosts.some((post) => post.readOnlyTelegramPost)
                          ? t("telegram.posts.editor.syncedCannotDelete")
                          : t("telegram.posts.editor.deleteSelectedAction")
                      }
                      aria-label={t("telegram.posts.editor.deleteSelected")}
                      className="flex h-9 min-w-12 items-center justify-center px-3"
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
              </>
            ) : !posts.isLoading ? (
              <EmptyState
                text={
                  postSearch.trim()
                    ? t("telegram.posts.editor.noSearchResults")
                    : t("telegram.posts.editor.noStatusPosts", {
                        status: t(managedPostStatusKey(statusTab)),
                      })
                }
              />
            ) : null}
          </Card>
        </div>
      )}

      <ConfirmDeleteModal
        open={!!deletingPost}
        onClose={() => setDeletingPost(null)}
        entityName={deletingPost?.title || ""}
        label={t("telegram.posts.editor.deletePost")}
        description={
          deletingPost?.status === "SCHEDULED"
            ? t("telegram.posts.editor.deleteScheduledDescription")
            : t("telegram.posts.editor.deleteDescription")
        }
        onConfirm={() => {
          if (!deletingPost) return;
          const postToDelete = deletingPost;
          setDeletingPost(null);
          void deletePosts([postToDelete]);
        }}
      />
      {movingPost ? (
        <MovePostModal
          post={movingPost}
          channels={channels}
          sourceChannelId={channelId}
          onClose={() => setMovingPost(null)}
          onMoved={async (result) => {
            setMovingPost(null);
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: telegramPostKeys.managedLists(channelId),
              }),
              queryClient.invalidateQueries({
                queryKey: ["post-groups", channelId],
              }),
            ]);
            pushToast(
              t("telegram.posts.bulk.completed", {
                success: result.successCount,
                failed: result.failedCount,
                skipped: result.skippedCount,
              }),
              result.failedCount ? "error" : "success",
              7000,
            );
            if (editing?.id === movingPost.id) reset();
          }}
        />
      ) : null}
      {editing && restorePreviewRevision ? (
        <Modal
          open
          onClose={() => {
            if (restorePostRevision.isPending) return;
            setRestorePreviewRevision(null);
            setRestoreConfirmationValue("");
          }}
          title={t("telegram.posts.editor.restoreBackup")}
          size="xl"
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_360px]">
            <TelegramPostPreview
              channelTitle={channelTitle}
              channelPhotoUrl={channelPhotoUrl}
              text={restorePreviewRevision.text || ""}
              imageUrls={restorePreviewRevision.imageUrls}
              buttonRows={restorePreviewRevision.buttonRows ?? []}
              captionLengthMax={
                restorePreviewRevision.captionLengthMaxUsed ??
                effectiveCaptionLengthMax
              }
              messageLengthMax={
                restorePreviewRevision.messageLengthMaxUsed ??
                effectiveMessageLengthMax
              }
              longTextMode={
                restorePreviewRevision.publishMode === "CAPTION_THEN_TEXT"
                  ? "CAPTION_THEN_TEXT"
                  : "IMAGES_THEN_TEXT"
              }
            />
            <div className="space-y-4">
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-4">
                <p className="text-sm font-medium text-white">
                  {formatManagedPostRevisionReason(t, restorePreviewRevision.reason)}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {t("telegram.posts.history.createdAt", {
                    date: formatDateTime(restorePreviewRevision.createdAt, locale),
                  })}
                </p>
              </div>
              <div className="space-y-2 rounded-lg border border-amber-800/70 bg-amber-950/20 p-4 text-sm text-amber-100">
                <p>{t("telegram.posts.editor.restoreWarning")}</p>
                <p className="text-xs text-amber-300/80">
                  {t("telegram.posts.editor.restoreConfirmTitle")}
                </p>
                <p className="rounded-md border border-amber-900/70 bg-black/20 px-3 py-2 font-medium text-white">
                  {editing.title}
                </p>
                <Input
                  value={restoreConfirmationValue}
                  onChange={(event) =>
                    setRestoreConfirmationValue(event.target.value)
                  }
                  placeholder={editing.title}
                  disabled={restorePostRevision.isPending}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRestorePreviewRevision(null);
                    setRestoreConfirmationValue("");
                  }}
                  disabled={restorePostRevision.isPending}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  disabled={
                    restorePostRevision.isPending || !restoreConfirmationValid
                  }
                  onClick={() => restorePostRevision.mutate(restorePreviewRevision)}
                >
                  {restorePostRevision.isPending
                    ? t("telegram.posts.editor.restoring")
                    : t("telegram.posts.editor.restoreVersion")}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
      <ConfirmDeleteModal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        entityName={t("telegram.posts.editor.selectedPosts", {
          count: selectedPosts.length,
        })}
        label={t("telegram.posts.editor.deleteSelected")}
        description={
          selectedPosts.some((post) => post.status === "SCHEDULED")
            ? t("telegram.posts.editor.deleteSelectedScheduledDescription")
            : t("telegram.posts.editor.deleteSelectedDescription")
        }
        onConfirm={() => {
          const postsToDelete = [...selectedPosts];
          setBulkDeleteOpen(false);
          void deletePosts(postsToDelete);
        }}
      />
    </>
  );
}

function PostIcon({
  iconId,
  icon,
  label,
  size = "xs",
  bare = false,
}: {
  iconId?: string | null;
  icon?: ResolvedEmoji | null;
  label: string;
  size?: "xs" | "sm" | "md";
  bare?: boolean;
}) {
  if (!iconId && !icon) return null;
  const isTelegramSystemGroupIcon =
    icon?.type === "image" &&
    (icon?.name === "telegram-system-group-icon" ||
      iconId === "telegram-system-group-icon" ||
      iconId === "telegram-system-group-icon");
  return (
    <IconAvatar
      icon={icon}
      label={label}
      size={size}
      bordered={!bare && !isTelegramSystemGroupIcon}
      className={bare || isTelegramSystemGroupIcon ? "!border-0 !bg-transparent" : ""}
    />
  );
}

function PendingPostRow({ pending }: { pending: PendingPostSave }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-blue-700/70 bg-blue-950/15 px-3 py-2">
      <LoaderCircle size={16} className="shrink-0 animate-spin text-blue-400" />
      <PostIcon iconId={pending.icon} label={pending.title} bare />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-white">{pending.title}</span>
      </span>
      <span className="text-[11px] text-blue-300">
        {t("telegram.posts.editor.saving")}
      </span>
    </div>
  );
}

function MovePostModal({
  post,
  channels,
  sourceChannelId,
  onClose,
  onMoved,
}: {
  post: TelegramManagedPost;
  channels: TelegramChannel[];
  sourceChannelId: string;
  onClose: () => void;
  onMoved: (result: BulkActionResult) => Promise<void>;
}) {
  const { t } = useI18n();
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={t("telegram.posts.editor.movePost")}
        loading={busy}
        allowOverflow
      >
        <div className="space-y-4">
          <p className="text-sm text-amber-200">
            {t("telegram.posts.editor.moveDescription")}
          </p>
          <FormField label={t("telegram.posts.editor.targetChannel")} required>
            <CustomSelect
              value={targetId}
              onChange={setTargetId}
              options={channels
                .filter((channel) => channel.id !== sourceChannelId)
                .map((channel) => ({
                  value: channel.id,
                  label: channel.title,
                  iconUrl: channel.photoUrl || undefined,
                }))}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!targetId || busy}
              onClick={async () => {
                if (!targetId) return;
                setBusy(true);
                setProgress({
                  title: t("telegram.posts.editor.moving"),
                  current: 0,
                  total: 1,
                });
                try {
                  const response = await telegramChannelsApi.moveManagedPost(
                    sourceChannelId,
                    post.id,
                    targetId,
                  );
                  setProgress({
                    title: t("telegram.posts.editor.moving"),
                    current: 1,
                    total: 1,
                    item: response.results[0],
                    result: response,
                  });
                  await onMoved(response);
                  window.setTimeout(() => setProgress(null), 2200);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("telegram.posts.editor.movePost")}
            </Button>
          </div>
        </div>
      </Modal>
      <BulkProgressOverlay progress={progress} />
    </>
  );
}

function PostGroupsWorkspace({
  channelId,
  channels,
  initialGroupId,
  newGroupRequested,
  onNewGroupRequestHandled,
  onOpenPost,
}: {
  channelId: string;
  channels: TelegramChannel[];
  initialGroupId: string;
  newGroupRequested: boolean;
  onNewGroupRequestHandled: () => void;
  onOpenPost: (post: TelegramManagedPost) => void;
}) {
  const { locale, t } = useI18n();
  const localizedApiError = useCallback(
    (error: unknown, fallback: string) =>
      safeApiErrorMessage(error, locale, t, fallback),
    [locale, t],
  );
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pushToast, setProgress, clearProgress } = useAppToast();
  const openedFromSearchRef = useRef("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const selectGroup = (groupId: string | null) => {
    setSelectedGroupId(groupId);
    router.replace(
      buildTelegramPostsUrl({
        channelId,
        groupId,
        postView: "groups",
      }),
    );
  };
  const [groupForm, setGroupForm] = useState<PostGroup | "new" | null>(null);
  useEffect(() => {
    if (!newGroupRequested) return;
    const timeout = window.setTimeout(() => {
      setGroupForm("new");
      onNewGroupRequestHandled();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [newGroupRequested, onNewGroupRequestHandled]);
  const [addPostsOpen, setAddPostsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [movingListGroup, setMovingListGroup] = useState<PostGroup | null>(null);
  const [movingGroupPost, setMovingGroupPost] = useState<TelegramManagedPost | null>(
    null,
  );
  const [publishOpen, setPublishOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [resetDraftsOpen, setResetDraftsOpen] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState<PostGroup | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const reorderTimerRef = useRef<number | null>(null);
  const reorderVersionRef = useRef(0);
  const reorderQueueRef = useRef<Promise<void>>(Promise.resolve());
  const groupsPagination = usePagination({ initialPageSize: 10 });
  const groups = useQuery({
    queryKey: [
      "post-groups",
      channelId,
      { page: groupsPagination.page, pageSize: groupsPagination.pageSize },
    ],
    queryFn: () =>
      telegramChannelsApi.postGroupsPage({
        telegramChannelId: channelId,
        page: groupsPagination.page,
        pageSize: groupsPagination.pageSize,
      }),
    placeholderData: keepPreviousData,
  });
  const detail = useQuery({
    queryKey: ["post-group", selectedGroupId],
    queryFn: () => telegramChannelsApi.postGroup(selectedGroupId as string),
    enabled: Boolean(selectedGroupId),
  });
  const groupPostsPagination = usePagination({ initialPageSize: 50 });
  const posts = useQuery({
    queryKey: [
      "telegram-managed-posts",
      channelId,
      "group-picker",
      {
        page: groupPostsPagination.page,
        pageSize: groupPostsPagination.pageSize,
      },
    ],
    queryFn: () =>
      telegramChannelsApi.managedPostsPage(channelId, {
        page: groupPostsPagination.page,
        pageSize: groupPostsPagination.pageSize,
      }),
    placeholderData: keepPreviousData,
  });
  const [orderedPostIds, setOrderedPostIds] = useState<string[]>([]);
  const orderedPosts = useMemo(() => {
    const source = detail.data?.posts || [];
    if (
      orderedPostIds.length !== source.length ||
      orderedPostIds.some((id) => !source.some((post) => post.id === id))
    ) {
      return source;
    }
    const byId = new Map(source.map((post) => [post.id, post]));
    return orderedPostIds
      .map((id) => byId.get(id))
      .filter((post): post is TelegramManagedPost => Boolean(post));
  }, [detail.data?.posts, orderedPostIds]);

  const groupsList = useMemo(() => groups.data?.items || [], [groups.data]);
  const groupsLoading = groups.isLoading || groups.isPlaceholderData;
  useEffect(() => {
    if (!initialGroupId) {
      openedFromSearchRef.current = "";
      return;
    }
    if (openedFromSearchRef.current === initialGroupId) return;
    setSelectedGroupId(initialGroupId);
    openedFromSearchRef.current = initialGroupId;
  }, [groupsList, initialGroupId]);
  const refresh = async (channelIds: string[] = [channelId]) => {
    const uniqueChannelIds = [...new Set(channelIds.filter(Boolean))];
    await Promise.all([
      ...uniqueChannelIds.flatMap((id) => [
        queryClient.invalidateQueries({ queryKey: ["post-groups", id] }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-posts", id],
        }),
      ]),
      selectedGroupId
        ? queryClient.invalidateQueries({
            queryKey: ["post-group", selectedGroupId],
          })
        : Promise.resolve(),
    ]);
  };

  const forceReloadGroupData = async (channelIds: string[]) => {
    const uniqueChannelIds = [...new Set(channelIds.filter(Boolean))];
    uniqueChannelIds.forEach((id) => {
      queryClient.removeQueries({ queryKey: ["post-groups", id], exact: true });
      queryClient.removeQueries({
        queryKey: ["telegram-managed-posts", id],
        exact: true,
      });
    });
    if (selectedGroupId) {
      queryClient.removeQueries({
        queryKey: ["post-group", selectedGroupId],
        exact: true,
      });
    }
    await Promise.all([
      ...uniqueChannelIds.flatMap((id) => [
        queryClient.refetchQueries({
          queryKey: ["post-groups", id],
          exact: true,
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: ["telegram-managed-posts", id],
          exact: true,
          type: "active",
        }),
      ]),
    ]);
  };

  const scheduleProgressDismiss = (progressId: string, delayMs = 2800) => {
    window.setTimeout(() => clearProgress(progressId), delayMs);
  };
  const progressMetaForGroup = (group: PostGroup) => {
    const icon = group.iconPresentation;
    return {
      id: `move-group:${group.id}`,
      title: t("telegram.posts.groups.movingNamed", {
        title: telegramPostGroupTitle(group, t),
      }),
      iconEmoji: icon?.type === "unicode" ? icon.value : undefined,
      iconUrl: icon?.type === "image" ? icon.url : undefined,
    };
  };
  const scheduleReorderSave = (groupId: string, orderedPostIdsToSave: string[]) => {
    reorderVersionRef.current += 1;
    const version = reorderVersionRef.current;
    if (reorderTimerRef.current) {
      window.clearTimeout(reorderTimerRef.current);
    }
    reorderTimerRef.current = window.setTimeout(() => {
      reorderQueueRef.current = reorderQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const previousDetail = queryClient.getQueryData<PostGroup>([
            "post-group",
            groupId,
          ]);
          const previousPosts = snapshotManagedPostPages(queryClient, channelId);
          const orderIndex = new Map(
            orderedPostIdsToSave.map((id, index) => [id, index]),
          );
          queryClient.setQueryData<PostGroup>(["post-group", groupId], (current) =>
            current
              ? {
                  ...current,
                  posts: normalizeManagedPostNumbering(
                    [...(current.posts ?? [])].map((post) => ({
                      ...post,
                      groupPosition: orderIndex.get(post.id) ?? post.groupPosition,
                    })),
                  ),
                }
              : current,
          );
          mapManagedPostPages(queryClient, channelId, (current) => ({
            ...current,
            items: [
              ...normalizeManagedPostNumbering(
                current.items
                  .filter((post) => orderIndex.has(post.id))
                  .map((post) => ({
                    ...post,
                    groupPosition: orderIndex.get(post.id) ?? post.groupPosition,
                  })),
              ),
              ...current.items.filter((post) => !orderIndex.has(post.id)),
            ],
          }));
          try {
            await telegramChannelsApi.reorderPostGroup(
              groupId,
              orderedPostIdsToSave,
              true,
            );
            if (version !== reorderVersionRef.current) return;
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: ["post-group", groupId],
              }),
              queryClient.invalidateQueries({
                queryKey: telegramPostKeys.managedLists(channelId),
              }),
            ]);
            setOrderedPostIds([]);
            pushToast(t("telegram.posts.editor.postOrderSaved"), "success", 3000);
          } catch (error) {
            if (version !== reorderVersionRef.current) return;
            queryClient.setQueryData(["post-group", groupId], previousDetail);
            restoreManagedPostPages(queryClient, previousPosts);
            setOrderedPostIds([]);
            pushToast(
              localizedApiError(error, t("telegram.posts.editor.error.reorder")),
              "error",
            );
          }
        });
    }, 700);
  };

  const runBulk = async (
    title: string,
    request: (
      onProgress: (
        item: BulkActionResultItem,
        current: number,
        total: number,
      ) => void,
    ) => Promise<BulkActionResult>,
    progressMeta?: {
      id?: string;
      title?: string;
      iconEmoji?: string;
      iconUrl?: string;
      initialMessage?: string;
    },
  ) => {
    const total = detail.data?.posts?.length || 0;
    const progressId = progressMeta?.id;
    setProgress({
      id: progressId,
      title: progressMeta?.title || title,
      current: 0,
      total,
      message: progressMeta?.initialMessage || t("common.loading"),
      iconEmoji: progressMeta?.iconEmoji,
      iconUrl: progressMeta?.iconUrl,
      successCount: 0,
      failedCount: 0,
    });
    try {
      let successful = 0;
      let failed = 0;
      const result = await request((item, current, progressTotal) => {
        if (item.success && !item.skipped) successful += 1;
        else if (!item.success && !item.skipped) failed += 1;
        setProgress({
          id: progressId,
          title: progressMeta?.title || title,
          current,
          total: progressTotal,
          message: localizedBulkActionMessage(item, locale, t),
          iconEmoji: progressMeta?.iconEmoji,
          iconUrl: progressMeta?.iconUrl,
          successCount: successful,
          failedCount: failed,
        });
      });
      setProgress({
        id: progressId,
        title: progressMeta?.title || title,
        current: result.total,
        total: result.total,
        message: result.results.at(-1)
          ? localizedBulkActionMessage(result.results.at(-1)!, locale, t)
          : t("telegram.posts.bulk.completed", {
              success: result.successCount,
              failed: result.failedCount,
              skipped: result.skippedCount,
            }),
        completed: true,
        successCount: result.successCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        iconEmoji: progressMeta?.iconEmoji,
        iconUrl: progressMeta?.iconUrl,
      });
      if (progressId) scheduleProgressDismiss(progressId);
      else window.setTimeout(() => setProgress(null), 2800);
      await refresh();
      return result;
    } catch (error) {
      if (progressId) clearProgress(progressId);
      else setProgress(null);
      pushToast(
        localizedApiError(
          error,
          t("telegram.posts.groups.actionFailed", { action: title }),
        ),
        "error",
        7000,
      );
      throw error;
    }
  };

  const groupActionButtonClass =
    "inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-200 transition hover:bg-neutral-800";
  const groupIconActionButtonClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-700 text-neutral-300 transition hover:bg-neutral-800";
  const groupDangerActionButtonClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-700 text-rose-300 transition hover:bg-rose-950/40";

  if (selectedGroupId) {
    const group = detail.data;
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => selectGroup(null)}
            className={groupActionButtonClass}
          >
            ← {t("telegram.posts.tabs.groups")}
          </button>
          {group ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAddPostsOpen(true)}
                className={groupActionButtonClass}
              >
                <ListPlus size={14} />
                {t("telegram.posts.groups.addPosts")}
              </button>
              <button
                type="button"
                onClick={() => setScheduleOpen(true)}
                className={groupActionButtonClass}
              >
                <Clock3 size={14} />
                {t("telegram.posts.groups.schedule")}
              </button>
              <button
                type="button"
                onClick={() => setPublishOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white transition hover:bg-blue-500"
              >
                <Rocket size={14} />
                {t("telegram.posts.groups.publishAllAction")}
              </button>
              <button
                type="button"
                onClick={() => setResetDraftsOpen(true)}
                className={groupActionButtonClass}
              >
                <RotateCcw size={14} />
                {t("telegram.posts.groups.makeDrafts")}
              </button>
              <button
                type="button"
                onClick={() => setMoveOpen(true)}
                className={groupIconActionButtonClass}
                title={t("telegram.posts.groups.move")}
                aria-label={t("telegram.posts.groups.move")}
              >
                <MoveRight size={14} />
              </button>
              {!group.isSystem ? (
                <>
                  <button
                    type="button"
                    onClick={() => setGroupForm(group)}
                    className={groupIconActionButtonClass}
                    title={t("telegram.posts.groups.edit")}
                    aria-label={t("telegram.posts.groups.edit")}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingGroup(group)}
                    className={groupDangerActionButtonClass}
                    title={t("telegram.posts.groups.delete")}
                    aria-label={t("telegram.posts.groups.delete")}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        {detail.isLoading ? <LoadingState /> : null}
        {group ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
            <Card className="space-y-4">
              <div className="flex items-start gap-3">
                <PostIcon
                  iconId={group.icon}
                  icon={group.iconPresentation}
                  label={telegramPostGroupTitle(group, t)}
                  size="md"
                />
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-white">
                    {telegramPostGroupTitle(group, t)}
                  </h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    {group.description || t("telegram.posts.groups.noDescription")}
                  </p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs uppercase text-neutral-500">
                  {group.isSystem
                    ? t("telegram.posts.groups.groupType")
                    : t("telegram.posts.groups.createdBy")}
                </p>
                {group.isSystem ? (
                  <span className="inline-flex rounded-full border border-amber-600/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">
                    {t("telegram.posts.groups.systemGroup")}
                  </span>
                ) : (
                  <MemberBadge member={group.createdByMember} />
                )}
              </div>
              <div>
                <p className="mb-1 text-xs uppercase text-neutral-500">
                  {t("telegram.posts.groups.telegramChannel")}
                </p>
                <p className="text-sm text-neutral-200">
                  {group.telegramChannel?.title ||
                    channels.find((item) => item.id === group.telegramChannelId)
                      ?.title}
                </p>
              </div>
              <GroupSummary summary={group.statusSummary} />
            </Card>
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-white">
                  {t("telegram.posts.groups.postsInGroup")}
                </h3>
                <span className="text-xs text-neutral-500">
                  {t("telegram.posts.groups.dragToReorder")}
                </span>
              </div>
              {orderedPosts.length ? (
                <div className="space-y-2">
                  {orderedPosts.map((post) => (
                    <div
                      key={post.id}
                      draggable
                      onDragStart={() => setDraggedId(post.id)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (!draggedId || draggedId === post.id) return;
                        setOrderedPostIds((currentIds) => {
                          const current = currentIds.length
                            ? currentIds
                            : orderedPosts.map((item) => item.id);
                          const from = current.indexOf(draggedId);
                          const to = current.indexOf(post.id);
                          if (from < 0 || to < 0) return current;
                          const next = [...current];
                          const [moved] = next.splice(from, 1);
                          next.splice(to, 0, moved);
                          return next;
                        });
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        scheduleReorderSave(
                          group.id,
                          orderedPosts.map((item) => item.id),
                        );
                      }}
                      className={`flex items-center gap-3 rounded-lg border p-3 ${
                        draggedId === post.id
                          ? "border-blue-500 bg-blue-950/30 opacity-70"
                          : "border-neutral-800 bg-neutral-950"
                      }`}
                    >
                      <GripVertical
                        size={18}
                        className="cursor-grab text-neutral-500"
                      />
                      <button
                        type="button"
                        onClick={() => onOpenPost(post)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="flex min-w-0 items-center gap-1.5 text-sm text-white">
                          {post.icon ? (
                            <PostIcon
                              iconId={post.icon}
                              icon={post.iconPresentation}
                              label={post.title}
                              bare
                            />
                          ) : (
                            <PostStatusIcon status={post.status} />
                          )}
                          <span className="truncate">{post.title}</span>
                        </span>
                        <span className="block text-xs text-neutral-500">
                          {post.scheduledAt
                            ? formatDateTime(post.scheduledAt, locale)
                            : t(managedPostStatusKey(post.status))}
                        </span>
                      </button>
                      <MemberBadge member={post.assignedMember} compact />
                      <button
                        className="rounded-md border border-neutral-700 p-1.5 text-neutral-300 hover:bg-neutral-800"
                        title={t("telegram.posts.editor.moveToChannel")}
                        onClick={() => setMovingGroupPost(post)}
                      >
                        <MoveRight size={14} />
                      </button>
                      <button
                        className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                        onClick={async () => {
                          await telegramChannelsApi.removePostFromGroup(
                            group.id,
                            post.id,
                          );
                          await refresh();
                        }}
                      >
                        {t("common.remove")}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text={t("telegram.posts.groups.empty")} />
              )}
            </Card>
          </div>
        ) : null}
        {groupForm ? (
          <GroupFormModal
            key={groupForm === "new" ? "new" : groupForm.id}
            value={groupForm}
            channelId={channelId}
            onClose={() => setGroupForm(null)}
            onSaved={async (saved) => {
              setGroupForm(null);
              selectGroup(saved.id);
              await refresh();
            }}
          />
        ) : null}
        {addPostsOpen ? (
          <AddPostsModal
            group={group}
            posts={posts.data?.items || []}
            pagination={posts.data?.pagination}
            onPageChange={groupPostsPagination.setPage}
            onPageSizeChange={groupPostsPagination.setPageSize}
            loading={posts.isLoading || posts.isPlaceholderData}
            onClose={() => setAddPostsOpen(false)}
            onAdded={async () => {
              setAddPostsOpen(false);
              await refresh();
            }}
          />
        ) : null}
        {moveOpen ? (
          <MoveGroupModal
            group={group}
            channels={channels}
            onClose={() => setMoveOpen(false)}
            onSubmit={async (targetId) => {
              setMoveOpen(false);
              await runBulk(
                t("telegram.posts.groups.moving"),
                async (onProgress) => {
                  const response = await telegramChannelsApi.movePostGroup(
                    group!.id,
                    targetId,
                    true,
                    onProgress,
                  );
                  return response;
                },
                {
                  ...progressMetaForGroup(group!),
                  initialMessage: t("common.loading"),
                },
              );
              selectGroup(null);
              await refresh([channelId, targetId]);
              await forceReloadGroupData([channelId, targetId]);
            }}
          />
        ) : null}
        {movingGroupPost ? (
          <MovePostModal
            post={movingGroupPost}
            channels={channels}
            sourceChannelId={group?.telegramChannelId || channelId}
            onClose={() => setMovingGroupPost(null)}
            onMoved={async (result) => {
              setMovingGroupPost(null);
              await refresh();
              pushToast(
                t("telegram.posts.bulk.completed", {
                  success: result.successCount,
                  failed: result.failedCount,
                  skipped: result.skippedCount,
                }),
                result.failedCount ? "error" : "success",
                7000,
              );
            }}
          />
        ) : null}
        <PublishGroupModal
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          onSubmit={async (options) => {
            setPublishOpen(false);
            await runBulk(t("telegram.posts.groups.publishProgress"), (onProgress) =>
              telegramChannelsApi.publishPostGroup(
                group!.id,
                options,
                true,
                onProgress,
              ),
            );
          }}
        />
        <ScheduleGroupModal
          open={scheduleOpen}
          group={group}
          onClose={() => setScheduleOpen(false)}
          onSubmit={async (payload) => {
            setScheduleOpen(false);
            await runBulk(t("telegram.posts.groups.scheduleProgress"), (onProgress) =>
              telegramChannelsApi.schedulePostGroupSequence(
                group!.id,
                payload,
                true,
                onProgress,
              ),
            );
          }}
        />
        <Modal
          open={resetDraftsOpen}
          onClose={() => setResetDraftsOpen(false)}
          title={t("telegram.posts.groups.makeDraftsTitle")}
        >
          <p className="text-sm text-neutral-300">
            {t("telegram.posts.groups.scheduledDraftDescription")}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResetDraftsOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                setResetDraftsOpen(false);
                void runBulk(t("telegram.posts.groups.draftProgress"), (onProgress) =>
                  telegramChannelsApi.resetPostGroupToDrafts(
                    group!.id,
                    true,
                    onProgress,
                  ),
                ).catch(() => undefined);
              }}
            >
              {t("telegram.posts.groups.makeAllDrafts")}
            </Button>
          </div>
        </Modal>
        <ConfirmDeleteModal
          open={!!deletingGroup}
          onClose={() => setDeletingGroup(null)}
          entityName={deletingGroup?.title || ""}
          label={t("telegram.posts.groups.delete")}
          description={t("telegram.posts.groups.deleteDescription")}
          onConfirm={async () => {
            if (!deletingGroup) return;
            await telegramChannelsApi.deletePostGroup(deletingGroup.id);
            setDeletingGroup(null);
            selectGroup(null);
            await groups.refetch();
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">
            {t("telegram.posts.groups.title")}
          </h2>
          <p className="text-sm text-neutral-400">
            {t("telegram.posts.groups.namedSeries")}
          </p>
        </div>
      </div>
      {groupsLoading ? (
        <PostGroupCardsSkeleton
          count={groups.data?.items.length || groupsPagination.pageSize}
        />
      ) : null}
      {!groupsLoading && groupsList.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groupsList.map((group) => (
            <div
              key={group.id}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left transition hover:border-blue-700 hover:bg-neutral-900/80"
            >
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => selectGroup(group.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <PostIcon
                      iconId={group.icon}
                      icon={group.iconPresentation}
                      label={telegramPostGroupTitle(group, t)}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-white">
                        {telegramPostGroupTitle(group, t)}
                      </h3>
                      <div className="mt-1">
                        {group.isSystem ? (
                          <span className="inline-flex rounded-full border border-amber-600/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-200">
                            {t("telegram.posts.groups.systemGroup")}
                          </span>
                        ) : (
                          <MemberBadge member={group.createdByMember} />
                        )}
                      </div>
                    </div>
                  </button>
                  <TelegramCardActionsMenu
                    label={t("telegram.posts.groups.actionsNamed", {
                      title: telegramPostGroupTitle(group, t),
                    })}
                  >
                    <TelegramCardMenuAction
                      label={t("telegram.posts.groups.open")}
                      icon={<ChevronRight size={17} />}
                      onClick={() => selectGroup(group.id)}
                    />
                    <TelegramCardMenuAction
                      label={t("telegram.posts.groups.move")}
                      icon={<MoveRight size={17} />}
                      onClick={() => setMovingListGroup(group)}
                    />
                    {!group.isSystem ? (
                      <>
                        <TelegramCardMenuAction
                          label={t("telegram.posts.groups.edit")}
                          icon={<Pencil size={17} />}
                          onClick={() => setGroupForm(group)}
                        />
                        <div className="my-1 border-t border-neutral-800" />
                        <TelegramCardMenuAction
                          label={t("telegram.posts.groups.delete")}
                          icon={<Trash2 size={17} />}
                          onClick={() => setDeletingGroup(group)}
                          danger
                        />
                      </>
                    ) : null}
                  </TelegramCardActionsMenu>
                </div>
              </div>
              <button
                type="button"
                onClick={() => selectGroup(group.id)}
                className="mt-4 block w-full text-left"
              >
                <GroupSummary summary={group.statusSummary} />
              </button>
            </div>
          ))}
        </div>
      ) : !groupsLoading ? (
        <EmptyState text={t("telegram.posts.groups.emptyAll")} />
      ) : null}
      {groups.data ? (
        <Pagination
          page={groups.data.pagination.page}
          pageSize={groups.data.pagination.pageSize}
          totalItems={groups.data.pagination.totalItems}
          totalPages={groups.data.pagination.totalPages}
          hasNextPage={groups.data.pagination.hasNextPage}
          hasPreviousPage={groups.data.pagination.hasPreviousPage}
          onPageChange={groupsPagination.setPage}
          onPageSizeChange={groupsPagination.setPageSize}
          loading={groupsLoading}
        />
      ) : null}
      {groupForm ? (
        <GroupFormModal
          key={groupForm === "new" ? "new" : groupForm.id}
          value={groupForm}
          channelId={channelId}
          onClose={() => setGroupForm(null)}
          onSaved={async (saved) => {
            setGroupForm(null);
            await groups.refetch();
            selectGroup(saved.id);
          }}
        />
      ) : null}
      {movingListGroup ? (
        <MoveGroupModal
          group={movingListGroup}
          channels={channels}
          onClose={() => setMovingListGroup(null)}
          onSubmit={async (targetId) => {
            const group = movingListGroup;
            setMovingListGroup(null);
            if (!group) return;
            await runBulk(
              t("telegram.posts.groups.moving"),
              async (onProgress) =>
                telegramChannelsApi.movePostGroup(
                  group.id,
                  targetId,
                  true,
                  onProgress,
                ),
              {
                ...progressMetaForGroup(group),
                initialMessage: t("common.loading"),
              },
            );
            await refresh([channelId, targetId]);
            await forceReloadGroupData([channelId, targetId]);
          }}
        />
      ) : null}
      <ConfirmDeleteModal
        open={!!deletingGroup}
        onClose={() => setDeletingGroup(null)}
        entityName={deletingGroup?.title || ""}
        label={t("telegram.posts.groups.delete")}
        description={t("telegram.posts.groups.deleteDescription")}
        onConfirm={async () => {
          if (!deletingGroup) return;
          await telegramChannelsApi.deletePostGroup(deletingGroup.id);
          setDeletingGroup(null);
          await groups.refetch();
        }}
      />
    </>
  );
}

function GroupSummary({ summary }: { summary: PostGroup["statusSummary"] }) {
  const { t } = useI18n();
  const visibleStatuses = [
    {
      label: t("telegramPosts.status.draft"),
      count: summary.draftCount,
      emoji: "📝",
      className: "border-blue-800/70 bg-blue-950/30 text-blue-200",
    },
    {
      label: t("telegramPosts.status.scheduled"),
      count: summary.scheduledCount,
      emoji: "🕒",
      className: "border-amber-800/70 bg-amber-950/30 text-amber-200",
    },
    {
      label: t("telegramPosts.status.published"),
      count: summary.publishedCount,
      emoji: "✅",
      className: "border-emerald-800/70 bg-emerald-950/30 text-emerald-200",
    },
    {
      label: t("telegramPosts.status.failed"),
      count: summary.failedCount,
      emoji: "⚠️",
      className: "border-red-800/70 bg-red-950/30 text-red-200",
    },
  ].filter((item) => item.count > 0);
  return (
    <div className="space-y-2">
      {visibleStatuses.length ? (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {visibleStatuses.map((item) => (
            <div
              key={item.label}
              className={`flex min-w-[92px] flex-1 items-center justify-center gap-2 rounded-md border px-2 py-2 ${item.className}`}
            >
              <span className="text-sm">{item.emoji}</span>
              <span>
                <span className="mr-1 font-semibold text-white">{item.count}</span>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CalendarPostTimePicker({
  post,
  selectedCalendarDate,
  availableCalendarScheduleSlots,
  calendarScheduleSlots,
  channelId,
  channelTimePosts,
  selectedPostIds,
  timeChoiceByPostId,
  customTimeByPostId,
  onTimeChoiceChange,
  onCustomTimeChange,
}: {
  post: TelegramManagedPost;
  selectedCalendarDate: string;
  availableCalendarScheduleSlots: Array<{
    id: string;
    title: string;
    time: string;
    iconId?: string | null;
    state: "available" | "occupied" | "past";
  }>;
  calendarScheduleSlots: Array<{
    time: string;
    state: "available" | "occupied" | "past";
  }>;
  channelId: string;
  channelTimePosts: TelegramChannelTimePost[];
  selectedPostIds: string[];
  timeChoiceByPostId: Record<string, string>;
  customTimeByPostId: Record<string, string>;
  onTimeChoiceChange: Dispatch<SetStateAction<Record<string, string>>>;
  onCustomTimeChange: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  const { t } = useI18n();
  const selectedChoice = timeChoiceByPostId[post.id] || "";
  const customTime = customTimeByPostId[post.id] || "";
  const slotState = calendarScheduleSlots.find(
    (slot) => slot.time === customTime,
  )?.state;
  const duplicate =
    customTime &&
    Object.entries(customTimeByPostId).some(
      ([otherPostId, value]) =>
        otherPostId !== post.id &&
        selectedPostIds.includes(otherPostId) &&
        timeChoiceByPostId[otherPostId] === "custom" &&
        value === customTime,
    );
  const invalidPast =
    isValidTimeInputValue(customTime) &&
    new Date(`${selectedCalendarDate}T${customTime}:00`).getTime() <= Date.now();
  const invalidOccupied =
    customTime && (slotState === "occupied" || slotState === "past");
  const errorMessage =
    selectedChoice === "custom"
      ? !customTime
        ? t("telegram.posts.calendar.enterTime")
        : !isValidTimeInputValue(customTime)
          ? t("telegram.posts.calendar.useTimeFormat")
          : duplicate
            ? t("telegram.posts.calendar.duplicateTime")
            : invalidPast
              ? t("telegram.posts.calendar.futureTime")
              : invalidOccupied
                ? t("telegram.posts.calendar.unavailableTime")
                : ""
      : "";

  return (
    <>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <CustomSelect
          value={selectedChoice}
          onChange={(value) =>
            onTimeChoiceChange((current) => ({
              ...current,
              [post.id]: value,
            }))
          }
          dropdownDirection="up"
          placeholder={t("telegram.posts.groups.chooseSlot")}
          searchable={false}
          dropdownClassName="min-w-[280px] sm:min-w-[320px]"
          options={[
            ...availableCalendarScheduleSlots
              .filter((slot) => {
                if (selectedChoice === `slot:${slot.time}`) return true;
                return !Object.entries(timeChoiceByPostId).some(
                  ([otherPostId, value]) =>
                    otherPostId !== post.id && value === `slot:${slot.time}`,
                );
              })
              .map((slot) => ({
                value: `slot:${slot.time}`,
                label: `${slot.time}  ${slot.title}`.trim(),
                iconEmoji: (() => {
                  const presentation = channelTimePosts.find(
                    (item) => item.id === slot.id,
                  )?.iconPresentation;
                  return presentation?.type === "unicode" ? presentation.value : "•";
                })(),
                tone: "success" as const,
              })),
            {
              value: "custom",
              label: t("telegram.posts.calendar.customTime"),
              iconEmoji: "🕒",
              tone: "info" as const,
            },
          ]}
        />
        <AddTimePostButton
          channelId={channelId}
          timePosts={channelTimePosts}
          presentation="calendar"
        />
        {selectedChoice === "custom" ? (
          <TimeInput
            className="col-span-2"
            value={customTime}
            onChange={(event) =>
              onCustomTimeChange((current) => ({
                ...current,
                [post.id]: event.target.value,
              }))
            }
          />
        ) : (
          <div className="col-span-2 flex h-9 items-center rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 text-xs text-neutral-500">
            {t("telegram.posts.calendar.slot")}
          </div>
        )}
      </div>
      {errorMessage ? (
        <div className="mt-2 text-xs text-rose-300">{errorMessage}</div>
      ) : null}
    </>
  );
}

function GroupFormModal({
  value,
  channelId,
  onClose,
  onSaved,
}: {
  value: PostGroup | "new";
  channelId: string;
  onClose: () => void;
  onSaved: (group: PostGroup) => Promise<void>;
}) {
  const { t } = useI18n();
  const editing = value && value !== "new" ? value : null;
  const [title, setTitle] = useState(editing?.title || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [icon, setIcon] = useState<string | null>(editing?.icon || null);
  const [statusNumberingEnabled, setStatusNumberingEnabled] = useState(
    Boolean(editing?.statusNumberingEnabled),
  );
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={
        editing ? t("telegram.posts.groups.edit") : t("telegram.posts.groups.create")
      }
      loading={busy}
      allowOverflow
    >
      <div className="space-y-3">
        <FormField label={t("telegram.posts.groups.titleField")} required>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </FormField>
        <FormField label={t("telegram.posts.groups.icon")}>
          <IconPicker
            iconId={icon}
            onChange={setIcon}
            buttonLabel={t("telegram.posts.icon.addIcon")}
          />
        </FormField>
        <FormField label={t("telegram.posts.groups.description")}>
          <Textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
        <ToggleRow
          checked={statusNumberingEnabled}
          onChange={setStatusNumberingEnabled}
          label={t("telegram.posts.groups.numberByStatus")}
          description={t("telegram.posts.groups.numberByStatusDescription")}
          activeTone="blue"
        />
        {editing ? (
          <div>
            <p className="mb-1 text-xs text-neutral-500">
              {t("telegram.posts.groups.createdBy")}
            </p>
            <MemberBadge member={editing.createdByMember} />
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!title.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const group = editing
                  ? await telegramChannelsApi.updatePostGroup(editing.id, {
                      title: title.trim(),
                      description: description.trim() || null,
                      icon,
                      statusNumberingEnabled,
                    })
                  : await telegramChannelsApi.createPostGroup({
                      telegramChannelId: channelId,
                      title: title.trim(),
                      description: description.trim() || null,
                      icon,
                      statusNumberingEnabled,
                      postIds: [],
                    });
                await onSaved(group);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("telegram.posts.groups.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MoveGroupModal({
  group,
  channels,
  onClose,
  onSubmit,
}: {
  group?: PostGroup;
  channels: TelegramChannel[];
  onClose: () => void;
  onSubmit: (targetId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [targetId, setTargetId] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title={t("telegram.posts.groups.move")}
      allowOverflow
    >
      <div className="space-y-4">
        <p className="text-sm text-amber-200">
          {t("telegram.posts.groups.moveDescription")}
        </p>
        <FormField label={t("telegram.posts.groups.targetChannel")} required>
          <CustomSelect
            value={targetId}
            onChange={setTargetId}
            options={channels
              .filter((channel) => channel.id !== group?.telegramChannelId)
              .map((channel) => ({
                value: channel.id,
                label: channel.title,
                iconUrl: channel.photoUrl || undefined,
              }))}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!targetId} onClick={() => onSubmit(targetId)}>
            {t("telegram.posts.groups.move")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PostUsageModal({
  post,
  usages,
  onClose,
  onOpenPost,
  onOpenPostInNewTab,
}: {
  post: TelegramManagedPost;
  usages: TelegramManagedPost[];
  onClose: () => void;
  onOpenPost: (post: TelegramManagedPost) => void;
  onOpenPostInNewTab: (post: TelegramManagedPost) => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open
      onClose={onClose}
      title={t("telegram.posts.groups.usedInPosts")}
      allowOverflow
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
          <div className="flex items-center gap-2">
            {post.icon ? (
              <PostIcon
                iconId={post.icon}
                icon={post.iconPresentation}
                label={post.title}
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{post.title}</p>
              <p className="text-xs text-neutral-400">
                {usages.length
                  ? t("telegram.posts.groups.usedCount", {
                      count: usages.length,
                    })
                  : t("telegram.posts.groups.notUsed")}
              </p>
            </div>
          </div>
        </div>
        {usages.length ? (
          <div className="space-y-1.5">
            {usages.map((usagePost) => (
              <button
                key={usagePost.id}
                type="button"
                onClick={(event) => {
                  if (wantsNewTab(event)) {
                    onOpenPostInNewTab(usagePost);
                    return;
                  }
                  onOpenPost(usagePost);
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-left transition hover:border-blue-700 hover:bg-blue-950/20"
              >
                {usagePost.icon ? (
                  <PostIcon
                    iconId={usagePost.icon}
                    icon={usagePost.iconPresentation}
                    label={usagePost.title}
                  />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-sm">
                    📝
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {usagePost.title}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {t(managedPostStatusKey(usagePost.status))}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-blue-300">
                  {t("common.open")}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState text={t("telegram.posts.groups.notLinked")} />
        )}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PublishGroupModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (options: {
    includeScheduled: boolean;
    includeFailed: boolean;
    republishPublished: boolean;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [includeScheduled, setIncludeScheduled] = useState(true);
  const [includeFailed, setIncludeFailed] = useState(true);
  const [republishPublished, setRepublishPublished] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("telegram.posts.groups.publishAllTitle")}
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-300">
          {t("telegram.posts.groups.publishDescription")}
        </p>
        {[
          [
            t("telegram.posts.groups.includeScheduled"),
            includeScheduled,
            setIncludeScheduled,
          ],
          [t("telegram.posts.groups.retryFailed"), includeFailed, setIncludeFailed],
          [
            t("telegram.posts.groups.republishPublished"),
            republishPublished,
            setRepublishPublished,
          ],
        ].map(([label, checked, setter]) => (
          <label key={String(label)} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked as boolean}
              onChange={(event) =>
                (setter as (value: boolean) => void)(event.target.checked)
              }
            />
            {label as string}
          </label>
        ))}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                includeScheduled,
                includeFailed,
                republishPublished,
              })
            }
          >
            {t("telegram.posts.groups.publishAllAction")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ScheduleGroupModal({
  open,
  group,
  onClose,
  onSubmit,
}: {
  open: boolean;
  group?: PostGroup;
  onClose: () => void;
  onSubmit: (payload: {
    startDate: string;
    time: string;
    intervalDays: number;
    timezone?: string;
    includeDraftsOnly?: boolean;
    overwriteExistingScheduled?: boolean;
    includeFailed?: boolean;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const localDate = new Date();
  localDate.setDate(localDate.getDate() + 1);
  const [startDate, setStartDate] = useState(localDate.toISOString().slice(0, 10));
  const [time, setTime] = useState("10:00");
  const [intervalDays, setIntervalDays] = useState(1);
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [overwrite, setOverwrite] = useState(false);
  const [includeDraftsOnly, setIncludeDraftsOnly] = useState(false);
  const [includeFailed, setIncludeFailed] = useState(true);
  const preview = useMemo(
    () =>
      (group?.posts || [])
        .filter((post) => {
          if (post.status === "DRAFT") return true;
          if (includeDraftsOnly) return false;
          if (post.status === "FAILED") return includeFailed;
          if (post.status === "SCHEDULED") return overwrite;
          return false;
        })
        .map((post, index) => {
          const date = new Date(`${startDate}T${time}:00`);
          date.setDate(date.getDate() + index * intervalDays);
          return { post, date };
        }),
    [
      group?.posts,
      startDate,
      time,
      intervalDays,
      includeDraftsOnly,
      includeFailed,
      overwrite,
    ],
  );
  return (
    <Modal open={open} onClose={onClose} title={t("telegram.posts.groups.schedule")}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t("telegram.posts.groups.startDate")} required>
            <DateInput
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </FormField>
          <FormField label={t("telegram.posts.groups.time")} required>
            <TimeInput
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </FormField>
          <FormField label={t("telegram.posts.groups.intervalDays")} required>
            <Input
              type="number"
              min={1}
              value={intervalDays}
              onChange={(event) =>
                setIntervalDays(Math.max(1, Number(event.target.value)))
              }
            />
          </FormField>
        </div>
        <FormField label={t("telegram.posts.groups.timezone")}>
          <Input
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          />
        </FormField>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
            />
            {t("telegram.posts.groups.overwriteScheduled")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeDraftsOnly}
              onChange={(event) => setIncludeDraftsOnly(event.target.checked)}
            />
            {t("telegram.posts.groups.draftsOnly")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeFailed}
              onChange={(event) => setIncludeFailed(event.target.checked)}
            />
            {t("telegram.posts.groups.includeFailed")}
          </label>
        </div>
        {preview.length ? (
          <div className="max-h-44 space-y-1 overflow-auto rounded-lg border border-neutral-800 p-2">
            {preview.map(({ post, date }) => (
              <div
                key={post.id}
                className="flex justify-between gap-3 text-xs text-neutral-300"
              >
                <span className="truncate">{post.title}</span>
                <span className="shrink-0">{date.toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!startDate || !time || intervalDays < 1}
            onClick={() =>
              onSubmit({
                startDate,
                time,
                intervalDays,
                timezone,
                overwriteExistingScheduled: overwrite,
                includeDraftsOnly,
                includeFailed,
              })
            }
          >
            {t("telegram.posts.groups.schedule")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
