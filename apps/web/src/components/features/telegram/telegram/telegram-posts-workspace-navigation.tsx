"use client";

import type { ReactNode } from "react";
import { Brain, FileText, Layers3, Plus } from "lucide-react";

import { Button } from "@/components/ui/primitives";

export type TelegramPostsWorkspaceView = "posts" | "groups" | "hypotheses";

export function TelegramPostsWorkspaceNavigation({
  view,
  onViewChange,
  onNewPost,
  onNewGroup,
  labels,
  children,
}: {
  view: TelegramPostsWorkspaceView;
  onViewChange: (view: TelegramPostsWorkspaceView) => void;
  onNewPost: () => void;
  onNewGroup: () => void;
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
                view === tab.view ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>
      {children}
      {view === "posts" ? (
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
