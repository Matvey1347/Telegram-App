"use client";

import { useI18n } from "@/providers/i18n-provider";
import { LoaderCircle } from "lucide-react";
import { type PendingPostSave } from "./telegram-post-workspace-model";
import { PostIcon } from "../managed-post-identity";

export function PendingPostRow({ pending }: { pending: PendingPostSave }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-blue-700/70 bg-blue-950/15 px-3 py-2">
      <LoaderCircle size={16} className="shrink-0 animate-spin text-blue-400" />
      <PostIcon iconId={pending.icon} label={pending.title} bare />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-white">
          {pending.title}
        </span>
      </span>
      <span className="text-[11px] text-blue-300">
        {t("telegram.posts.editor.saving")}
      </span>
    </div>
  );
}
