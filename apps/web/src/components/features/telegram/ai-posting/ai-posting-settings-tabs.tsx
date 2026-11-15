import { ArrowLeftRight, Film, MessageCircle, PenLine, Sparkles } from "lucide-react";

export type AiPostingSettingsTab =
  | "chat"
  | "idea"
  | "writing"
  | "images"
  | "transfer";

const options = [
  { value: "chat", label: "Чат", icon: MessageCircle },
  { value: "idea", label: "Идея канала", icon: Sparkles },
  { value: "writing", label: "Как писать", icon: PenLine },
  { value: "images", label: "Медиа", icon: Film },
  { value: "transfer", label: "Импорт / экспорт", icon: ArrowLeftRight },
] as const;

export function AiPostingSettingsTabs({
  value,
  onChange,
  hrefForTab,
}: {
  value: AiPostingSettingsTab;
  onChange: (tab: AiPostingSettingsTab) => void;
  hrefForTab?: (tab: AiPostingSettingsTab) => string;
}) {
  return (
    <div
      role="group"
      aria-label="Разделы AI Posting"
      className="flex w-fit max-w-full flex-wrap gap-1 rounded-md border border-neutral-700 bg-neutral-950 p-1"
    >
      {options.map(({ value: tab, label, icon: Icon }) => (
        <a
          key={tab}
          href={hrefForTab?.(tab) ?? `?aiPostingTab=${tab}`}
          aria-current={value === tab ? "page" : undefined}
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onChange(tab);
          }}
          className={`inline-flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-medium transition ${
            value === tab
              ? "bg-blue-600 text-white"
              : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
          }`}
        >
          <Icon size={13} aria-hidden="true" />
          <span>{label}</span>
        </a>
      ))}
    </div>
  );
}
