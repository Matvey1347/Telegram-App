"use client";

import { Clock3, FileText, Sparkles } from "lucide-react";

import { PageTabHead } from "@/components/layout/page-tab-head";

export type TelegramPostsPageView = "editor" | "calendar" | "ai-posting";

export function TelegramPostsPageTabHead({
  postView,
  channelTitle,
  channelPhotoUrl,
  labels,
}: {
  postView: TelegramPostsPageView;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  labels: {
    editor: string;
    calendar: string;
  };
}) {
  const title = postView === "ai-posting" ? "AI Posting" : labels[postView];
  const emoji = postView === "ai-posting" ? "✨" : postView === "calendar" ? "🗓️" : "✈️";
  const color = postView === "calendar" ? "#7c2d12" : "#2563eb";

  return (
    <PageTabHead
      title={`${title} · ${channelTitle} · Telegram System`}
      iconUrl={channelPhotoUrl || null}
      emoji={emoji}
      color={color}
    />
  );
}

export function TelegramPostsViewNavigation({
  view,
  onViewChange,
  labels,
}: {
  view: TelegramPostsPageView;
  onViewChange: (view: TelegramPostsPageView) => void;
  labels: Record<TelegramPostsPageView, string>;
}) {
  const tabs = [
    { view: "ai-posting" as const, icon: Sparkles },
    { view: "calendar" as const, icon: Clock3 },
    { view: "editor" as const, icon: FileText },
  ];

  return (
    <div
      role="tablist"
      aria-label="Публикации канала"
      className="inline-flex max-w-full flex-wrap rounded-lg border border-neutral-800 bg-neutral-950 p-1"
    >
      {tabs.map(({ view: value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={view === value}
          onClick={() => onViewChange(value)}
          className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm sm:px-4 ${
            view === value
              ? "bg-blue-600 text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <Icon size={15} />
          {labels[value]}
        </button>
      ))}
    </div>
  );
}
