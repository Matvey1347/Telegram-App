"use client";


export type TelegramChannelMessageTemplateEditorSection =
  | "text"
  | "details"
  | "channel"
  | "views"
  | "prices";

const sections: Array<{
  id: TelegramChannelMessageTemplateEditorSection;
  label: string;
}> = [
  { id: "text", label: "Text" },
  { id: "details", label: "Channels" },
  { id: "channel", label: "Channel info" },
  { id: "views", label: "Views" },
  { id: "prices", label: "Prices" },
];

export function TelegramChannelMessageTemplateEditorTabs({
  value,
  onChange,
}: {
  value: TelegramChannelMessageTemplateEditorSection;
  onChange: (value: TelegramChannelMessageTemplateEditorSection) => void;
}) {
  return (
    <div
      className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950/50 p-1 [scrollbar-width:thin]"
      role="tablist"
      aria-label="Message template settings"
    >
      <div className="flex min-w-max gap-1">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={value === section.id}
            onClick={() => onChange(section.id)}
            className={`rounded-md px-3 py-2 text-sm transition ${
              value === section.id
                ? "bg-blue-600 text-white"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>
    </div>
  );
}
