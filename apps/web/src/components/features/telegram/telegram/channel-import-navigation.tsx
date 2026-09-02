"use client";


import { CalendarDays, FileText, FolderOpen, Trash2 } from "lucide-react";
import { useI18n } from "@/providers/i18n-provider";

export type ChannelImportMode = "posts" | "groups" | "calendar" | "reimport";

export function ChannelImportNavigation({
  value,
  onChange,
  disabled = false,
}: {
  value: ChannelImportMode;
  onChange: (mode: ChannelImportMode) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const items = [
    { value: "posts" as const, label: t("telegram.posts.tabs.posts"), icon: FileText },
    { value: "groups" as const, label: t("telegram.posts.tabs.groups"), icon: FolderOpen },
    { value: "calendar" as const, label: t("telegram.posts.tabs.calendar"), icon: CalendarDays },
    { value: "reimport" as const, label: t("telegram.posts.import.reimportDelete"), icon: Trash2 },
  ];
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl border border-neutral-800 bg-neutral-950 p-1 md:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        const selected = value === item.value;
        const danger = item.value === "reimport";
        return (
          <button
            key={item.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(item.value)}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
              selected
                ? danger
                  ? "bg-rose-600 text-white"
                  : "bg-blue-600 text-white"
                : danger
                  ? "text-rose-300 hover:bg-rose-950/40"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
            }`}
          >
            <Icon size={15} /> {item.label}
          </button>
        );
      })}
    </div>
  );
}
