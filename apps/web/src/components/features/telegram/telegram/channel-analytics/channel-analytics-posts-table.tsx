"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronUp, Eye, Pencil, Smile } from "lucide-react";
import { Button, FormField, Input, Modal } from "@/components/ui/primitives";
import {
  formatLocalDate,
  toNumber,
  adjustedPostViews,
  adjustedPostReactions,
  formatNumber,
  formatPercent,
  channelMetricTips,
} from "./channel-analytics-format";
import { EmptyState, InfoTooltip } from "./channel-analytics-primitives";

const TelegramPostPreviewModal = dynamic(
  () =>
    import("@/components/features/telegram/telegram/post-preview-modal").then(
      (module) => module.TelegramPostPreviewModal,
    ),
  { loading: () => null },
);

export function PostsTable({
  channelId,
  channelTitle,
  channelPhotoUrl,
  posts,
  subscribers,
  ownViewsPerPost,
  ownReactionsPerPost,
  savingPostId,
  onSaveManualMetrics,
}: {
  channelId: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  posts: any[];
  subscribers: number;
  ownViewsPerPost: number;
  ownReactionsPerPost: number;
  savingPostId?: string | null;
  onSaveManualMetrics: (
    postId: string,
    payload: {
      manualOwnViews?: number;
      manualOwnReactions?: number;
      excludeFromAnalytics?: boolean;
    },
  ) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const floatingHeaderScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const headerContentRef = useRef<HTMLDivElement | null>(null);
  const [sortState, setSortState] = useState<{
    key:
      | "postDate"
      | "viewsCount"
      | "forwardsCount"
      | "reactionsCount"
      | "commentsCount"
      | "err"
      | "reactionRate"
      | null;
    direction: "asc" | "desc";
  }>({
    key: null,
    direction: "desc",
  });
  const columns: Array<{
    label: string;
    className: string;
    sortKey?:
      | "postDate"
      | "viewsCount"
      | "forwardsCount"
      | "reactionsCount"
      | "commentsCount"
      | "err"
      | "reactionRate";
    tip?: string;
  }> = [
    { label: "Date", className: "text-left", sortKey: "postDate" as const },
    { label: "Text", className: "text-left" },
    { label: "Views", className: "text-right", sortKey: "viewsCount" as const },
    {
      label: "Forwards",
      className: "text-right",
      sortKey: "forwardsCount" as const,
    },
    {
      label: "Reactions",
      className: "text-right",
      sortKey: "reactionsCount" as const,
    },
    {
      label: "Comments",
      className: "text-right",
      sortKey: "commentsCount" as const,
    },
    {
      label: "ERR",
      className: "text-right",
      sortKey: "err" as const,
      tip: channelMetricTips.err,
    },
    {
      label: "Reaction Rate",
      className: "text-right",
      sortKey: "reactionRate" as const,
      tip: channelMetricTips.reactionRate,
    },
    { label: "Manual correction", className: "text-right" },
  ];
  const gridTemplateColumns =
    "7rem minmax(18rem,1fr) 6rem 6rem 7rem 7rem 7rem 8rem 13rem";
  const [floatingHeader, setFloatingHeader] = useState({
    visible: false,
    left: 0,
    width: 0,
    height: 0,
  });
  const [previewPost, setPreviewPost] = useState<any | null>(null);
  const syncHeaderScroll = () => {
    if (!bodyScrollRef.current) return;
    const scrollLeft = bodyScrollRef.current.scrollLeft;
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = scrollLeft;
    }
    if (floatingHeaderScrollRef.current) {
      floatingHeaderScrollRef.current.scrollLeft = scrollLeft;
    }
  };
  const toggleSort = (key: NonNullable<typeof sortState.key>) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };
  const sortedPosts = useMemo(() => {
    if (!sortState.key) return posts;

    const getSortValue = (post: any) => {
      const views = toNumber(post.viewsCount);
      const reactions = toNumber(post.reactionsCount);
      const adjustedViews = adjustedPostViews(post, ownViewsPerPost);
      const adjustedReactions = adjustedPostReactions(
        post,
        ownReactionsPerPost,
      );
      switch (sortState.key) {
        case "postDate":
          return new Date(post.postDate ?? 0).getTime();
        case "viewsCount":
          return views;
        case "forwardsCount":
          return toNumber(post.forwardsCount);
        case "reactionsCount":
          return reactions;
        case "commentsCount":
          return toNumber(post.commentsCount);
        case "err":
          return subscribers > 0 ? (adjustedViews / subscribers) * 100 : -1;
        case "reactionRate":
          return adjustedViews > 0
            ? (adjustedReactions / adjustedViews) * 100
            : -1;
        default:
          return 0;
      }
    };

    return [...posts].sort((a, b) => {
      const aValue = getSortValue(a);
      const bValue = getSortValue(b);
      const result = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortState.direction === "asc" ? result : -result;
    });
  }, [ownReactionsPerPost, ownViewsPerPost, posts, sortState, subscribers]);

  useEffect(() => {
    const updateFloatingHeader = () => {
      const wrapper = wrapperRef.current;
      const header = headerContentRef.current;
      if (!wrapper || !header) return;

      const rect = wrapper.getBoundingClientRect();
      const headerHeight = header.getBoundingClientRect().height;
      const shouldShow = rect.top <= 0 && rect.bottom > headerHeight;

      setFloatingHeader((prev) => {
        const next = {
          visible: shouldShow,
          left: rect.left,
          width: rect.width,
          height: headerHeight,
        };
        if (
          prev.visible === next.visible &&
          prev.left === next.left &&
          prev.width === next.width &&
          prev.height === next.height
        ) {
          return prev;
        }
        return next;
      });
    };

    updateFloatingHeader();
    window.addEventListener("scroll", updateFloatingHeader, { passive: true });
    window.addEventListener("resize", updateFloatingHeader);
    return () => {
      window.removeEventListener("scroll", updateFloatingHeader);
      window.removeEventListener("resize", updateFloatingHeader);
    };
  }, []);

  const renderHeaderMarkup = (measure = false) => (
    <div
      ref={measure ? headerContentRef : null}
      className="grid min-w-[1200px] w-full"
      style={{ gridTemplateColumns }}
    >
      {columns.map((column) => (
        <div
          key={column.label}
          className={`whitespace-nowrap px-3 py-2 ${column.className}`}
        >
          {column.sortKey ? (
            (() => {
              const sortKey = column.sortKey;
              return (
                <span
                  className={`inline-flex items-center gap-1 ${
                    column.className.includes("text-right") ? "ml-auto" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(sortKey)}
                    className="inline-flex items-center gap-1"
                  >
                    <span>{column.label}</span>
                    {sortState.key === sortKey ? (
                      sortState.direction === "asc" ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )
                    ) : (
                      <ChevronDown size={14} className="opacity-35" />
                    )}
                  </button>
                  {column.tip ? <InfoTooltip tip={column.tip} /> : null}
                </span>
              );
            })()
          ) : (
            <span className="inline-flex items-center gap-1">
              <span>{column.label}</span>
              {column.tip ? <InfoTooltip tip={column.tip} /> : null}
            </span>
          )}
        </div>
      ))}
    </div>
  );

  if (!posts.length)
    return <EmptyState text="No post metrics with text yet." />;

  return (
    <div ref={wrapperRef} className="w-full rounded-lg border border-slate-700">
      <div
        ref={headerScrollRef}
        className="overflow-hidden rounded-t-lg border-b border-slate-800 bg-slate-900 text-xs font-semibold text-slate-300"
      >
        {renderHeaderMarkup(true)}
      </div>
      {floatingHeader.visible
        ? createPortal(
            <div
              className="fixed top-0 z-[90]"
              style={{
                left: floatingHeader.left,
                width: floatingHeader.width,
              }}
            >
              <div
                ref={floatingHeaderScrollRef}
                className="overflow-hidden rounded-t-lg border border-slate-700 border-b-slate-800 bg-slate-900 text-xs font-semibold text-slate-300 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
              >
                {renderHeaderMarkup()}
              </div>
            </div>,
            document.body,
          )
        : null}
      <div
        ref={bodyScrollRef}
        className="overflow-x-auto"
        onScroll={syncHeaderScroll}
      >
        <div className="min-w-[1200px] w-full text-sm">
          {sortedPosts.map((post) => {
            const views = toNumber(post.viewsCount);
            const reactions = toNumber(post.reactionsCount);
            const adjustedViews = adjustedPostViews(post, ownViewsPerPost);
            const adjustedReactions = adjustedPostReactions(
              post,
              ownReactionsPerPost,
            );
            return (
              <div
                key={post.id}
                className="grid border-t border-slate-800"
                style={{ gridTemplateColumns }}
              >
                <div className="whitespace-nowrap px-3 py-2">
                  {formatLocalDate(post.postDate)}
                </div>
                <div className="min-w-0 px-3 py-2">
                  <PostPreviewTrigger
                    post={post}
                    onOpen={() => setPreviewPost(post)}
                  />
                </div>
                <div className="whitespace-nowrap px-3 py-2 text-right">
                  {formatNumber(views)}
                </div>
                <div className="whitespace-nowrap px-3 py-2 text-right">
                  {formatNumber(post.forwardsCount)}
                </div>
                <div className="whitespace-nowrap px-3 py-2 text-right">
                  {formatNumber(reactions)}
                </div>
                <div className="whitespace-nowrap px-3 py-2 text-right">
                  {formatNumber(post.commentsCount)}
                </div>
                <div className="whitespace-nowrap px-3 py-2 text-right">
                  {subscribers > 0
                    ? formatPercent((adjustedViews / subscribers) * 100, 2)
                    : "-"}
                </div>
                <div className="whitespace-nowrap px-3 py-2 text-right">
                  {adjustedViews > 0
                    ? formatPercent(
                        (adjustedReactions / adjustedViews) * 100,
                        2,
                      )
                    : "-"}
                </div>
                <div className="px-3 py-2">
                  <PostManualMetricsEditor
                    post={post}
                    isSaving={savingPostId === post.id}
                    onSave={(payload) => onSaveManualMetrics(post.id, payload)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {previewPost ? (
        <TelegramPostPreviewModal
          open={Boolean(previewPost)}
          onClose={() => setPreviewPost(null)}
          channelTitle={channelTitle}
          channelPhotoUrl={channelPhotoUrl}
          post={previewPost}
        />
      ) : null}
    </div>
  );
}

function PostPreviewTrigger({
  post,
  onOpen,
}: {
  post: {
    id: string;
    primaryTelegramMessageUrl?: string | null;
    text?: string | null;
    formattedText?: string | null;
    hasMedia?: boolean;
    mediaKind?: string | null;
    telegramMessageId?: string | null;
  };
  onOpen: () => void;
}) {
  const text = post.text || "";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 max-w-full items-center gap-2 text-left transition-colors hover:text-white"
      title="Click to open Telegram-style post preview"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate">
          {text || (post.hasMedia ? "Image" : "-")}
        </span>
        {post.hasMedia ? (
          <span className="shrink-0" aria-label="Post contains media">
            🖼
          </span>
        ) : null}
      </span>
      <span className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300">
        Preview
      </span>
    </button>
  );
}

function PostManualMetricsEditor({
  post,
  isSaving,
  onSave,
}: {
  post: any;
  isSaving: boolean;
  onSave: (payload: {
    manualOwnViews?: number;
    manualOwnReactions?: number;
    excludeFromAnalytics?: boolean;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [manualOwnViews, setManualOwnViews] = useState(
    String(post.manualOwnViews ?? 0),
  );
  const [manualOwnReactions, setManualOwnReactions] = useState(
    String(post.manualOwnReactions ?? 0),
  );

  useEffect(() => {
    setManualOwnViews(String(post.manualOwnViews ?? 0));
    setManualOwnReactions(String(post.manualOwnReactions ?? 0));
  }, [post.manualOwnReactions, post.manualOwnViews]);

  const ownViews = toNumber(post.manualOwnViews);
  const ownReactions = toNumber(post.manualOwnReactions);
  const hasCorrection = ownViews > 0 || ownReactions > 0;
  const save = () => {
    onSave({
      manualOwnViews: Math.max(0, toNumber(manualOwnViews)),
      manualOwnReactions: Math.max(0, toNumber(manualOwnReactions)),
      excludeFromAnalytics: true,
    });
    setOpen(false);
  };

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {hasCorrection ? (
          <div className="min-w-0 space-y-1 text-xs text-slate-300">
            <p className="flex items-center gap-1 whitespace-nowrap">
              <Eye size={13} className="text-slate-500" />
              {formatNumber(ownViews)}
            </p>
            <p className="flex items-center gap-1 whitespace-nowrap">
              <Smile size={13} className="text-slate-500" />
              {formatNumber(ownReactions)}
            </p>
          </div>
        ) : (
          <span className="text-slate-500">-</span>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
          title="Edit manual correction"
        >
          <Pencil size={15} />
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Manual correction"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Own views">
              <Input
                type="number"
                min={0}
                value={manualOwnViews}
                onChange={(event) => setManualOwnViews(event.target.value)}
              />
            </FormField>
            <FormField label="Own reactions">
              <Input
                type="number"
                min={0}
                value={manualOwnReactions}
                onChange={(event) => setManualOwnReactions(event.target.value)}
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isSaving} onClick={save}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
