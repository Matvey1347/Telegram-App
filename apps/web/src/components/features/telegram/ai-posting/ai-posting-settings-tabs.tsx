import {
  BarChart3,
  Bot,
  FileText,
  Film,
  FolderKanban,
  History,
  Rss,
} from "lucide-react";

export type AiPostingSettingsTab =
  | "context"
  | "sources"
  | "formats"
  | "autopilot"
  | "images"
  | "performance"
  | "history";

const options = [
  { value: "context", label: "Контекст", icon: FileText },
  { value: "sources", label: "Источники", icon: Rss },
  { value: "formats", label: "Форматы", icon: FolderKanban },
  { value: "images", label: "Медиа", icon: Film },
  { value: "autopilot", label: "Автопилот", icon: Bot },
  { value: "performance", label: "Эффективность", icon: BarChart3 },
  { value: "history", label: "История профиля", icon: History },
] as const;

export function AiPostingSettingsTabs({
  value,
  onChange,
}: {
  value: AiPostingSettingsTab;
  onChange: (tab: AiPostingSettingsTab) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Разделы AI Posting"
      className="flex w-fit max-w-full flex-wrap gap-1 rounded-md border border-neutral-700 bg-neutral-950 p-1"
    >
      {options.map(({ value: tab, label, icon: Icon }) => (
        <button
          key={tab}
          type="button"
          aria-pressed={value === tab}
          onClick={() => onChange(tab)}
          className={`inline-flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-medium transition ${
            value === tab
              ? "bg-blue-600 text-white"
              : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
          }`}
        >
          <Icon size={13} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
