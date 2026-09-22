"use client";

import { Button } from "@/components/ui/primitives";

export type TelegramChannelMessageTemplateEditorSection =
  | "text"
  | "details"
  | "channel"
  | "prices";

const sections: Array<{
  id: TelegramChannelMessageTemplateEditorSection;
  label: string;
}> = [
  { id: "text", label: "Text" },
  { id: "details", label: "Channels" },
  { id: "channel", label: "Channel info" },
  { id: "prices", label: "Prices" },
];

export function TelegramChannelMessageTemplateEditorHeader({
  onBack,
  draftAutosaveEnabled,
}: {
  onBack: () => void;
  draftAutosaveEnabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button
        type="button"
        variant="secondary"
        className="h-9 w-9 p-0"
        aria-label="Back to templates"
        title="Back to templates"
        onClick={onBack}
      >
        <span aria-hidden className="text-xl leading-none">
          ←
        </span>
      </Button>
      <p className="text-xs text-neutral-500">
        {draftAutosaveEnabled
          ? "Draft saved automatically"
          : "Changes are applied after saving"}
      </p>
    </div>
  );
}

export function TelegramChannelMessageTemplateEditorTabs({
  value,
  onChange,
}: {
  value: TelegramChannelMessageTemplateEditorSection;
  onChange: (value: TelegramChannelMessageTemplateEditorSection) => void;
}) {
  return (
    <div
      className="flex gap-1 rounded-lg border border-neutral-800 bg-neutral-950/50 p-1"
      role="tablist"
      aria-label="Message template settings"
    >
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
  );
}
