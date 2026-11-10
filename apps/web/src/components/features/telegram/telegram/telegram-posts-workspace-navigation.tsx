"use client";

import type { ReactNode } from "react";
import { Brain, Clock3, FileText, Layers3, Plus, Sparkles } from "lucide-react";

import { PageTabHead } from "@/components/layout/page-tab-head";
import { Button } from "@/components/ui/primitives";

export type TelegramPostsWorkspaceView = "posts" | "groups" | "hypotheses";
export type TelegramPostsPageView = "editor" | "calendar" | "ai-posting";

export function TelegramPostsPageTabHead({
  workspaceView,
  postView,
  channelTitle,
  channelPhotoUrl,
  labels,
}: {
  workspaceView: TelegramPostsWorkspaceView;
  postView: TelegramPostsPageView;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  labels: {
    groups: string;
    hypotheses: string;
    posts: string;
    calendar: string;
  };
}) {
  const title =
    workspaceView === "groups"
      ? labels.groups
      : workspaceView === "hypotheses"
        ? labels.hypotheses
        : postView === "ai-posting"
          ? "AI Posting"
          : postView === "calendar"
            ? labels.calendar
            : labels.posts;
  const emoji =
    workspaceView === "groups"
      ? "🗂️"
      : workspaceView === "hypotheses"
        ? "🧠"
        : postView === "ai-posting"
          ? "✨"
          : postView === "calendar"
            ? "🗓️"
            : "✈️";
  const color =
    workspaceView === "groups"
      ? "#475569"
      : workspaceView === "hypotheses"
        ? "#6d28d9"
        : postView === "ai-posting"
          ? "#2563eb"
          : postView === "calendar"
            ? "#7c2d12"
            : "#1d4ed8";

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
    { view: "editor" as const, icon: FileText },
    { view: "calendar" as const, icon: Clock3 },
    { view: "ai-posting" as const, icon: Sparkles },
  ];

  return (
    <div
      role="tablist"
      aria-label="Публикации канала"
      className="inline-flex shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 p-1"
    >
      {tabs.map(({ view: value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={view === value}
          onClick={() => onViewChange(value)}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm ${
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

export function TelegramPostsWorkspaceNavigation({
  view,
  onViewChange,
  onNewPost,
  onNewGroup,
  showNewPost = true,
  labels,
  children,
}: {
  view: TelegramPostsWorkspaceView;
  onViewChange: (view: TelegramPostsWorkspaceView) => void;
  onNewPost: () => void;
  onNewGroup: () => void;
  showNewPost?: boolean;
  children?: ReactNode;
  labels: {
    posts: string;
    groups: string;
    hypotheses: string;
    newPost: string;
    newGroup: string;
  };
}) {
  const tabs = [
    { view: "posts" as const, icon: FileText, label: labels.posts },
    { view: "groups" as const, icon: Layers3, label: labels.groups },
    { view: "hypotheses" as const, icon: Brain, label: labels.hypotheses },
  ];

  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center gap-3">
      <div className="inline-flex shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.view}
              type="button"
              onClick={() => onViewChange(tab.view)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm ${
                view === tab.view
                  ? "bg-blue-600 text-white"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>
      {children}
      {view === "posts" && showNewPost ? (
        <Button type="button" className="ml-auto" onClick={onNewPost}>
          <Plus size={16} /> {labels.newPost}
        </Button>
      ) : view === "groups" ? (
        <Button type="button" className="ml-auto" onClick={onNewGroup}>
          <Plus size={16} /> {labels.newGroup}
        </Button>
      ) : null}
    </div>
  );
}
