"use client";

import { Check } from "lucide-react";
import type { TelegramChannelMessageTemplateLayout } from "./telegram-channel-message-template-format";

const options: Array<{
  id: keyof TelegramChannelMessageTemplateLayout;
  label: string;
  description: string;
  disabled?: (value: TelegramChannelMessageTemplateLayout) => boolean;
}> = [
  {
    id: "showEmoji",
    label: "Emoji",
    description: "Show the channel emoji before its name.",
  },
  {
    id: "showTitle",
    label: "Channel title",
    description: "Include the channel name.",
  },
  {
    id: "linkTitle",
    label: "Link channel title",
    description: "Open the invite link when the title is clicked.",
    disabled: (value) => !value.showTitle,
  },
  {
    id: "showViews",
    label: "Views per post",
    description: "Show the channel's configured views per post when available.",
  },
  {
    id: "showTgStat",
    label: "TgStat link",
    description: "Show TgStat only for channels where it is configured.",
  },
  {
    id: "showDescription",
    label: "Short description",
    description: "Show the description configured in Appearance.",
  },
];

export function TelegramChannelMessageTemplateLayoutOptions({
  value,
  onChange,
}: {
  value: TelegramChannelMessageTemplateLayout;
  onChange: (value: TelegramChannelMessageTemplateLayout) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const disabled = option.disabled?.(value) ?? false;
        const selected = value[option.id] && !disabled;
        return (
          <button
            key={option.id}
            type="button"
            role="switch"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange({ ...value, [option.id]: !selected })}
            className={`flex min-h-16 items-start gap-3 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
              selected
                ? "border-blue-500/70 bg-blue-500/10"
                : "border-neutral-800 bg-neutral-950/50 hover:border-neutral-700"
            }`}
          >
            <span
              className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                selected
                  ? "border-blue-500 bg-blue-600 text-white"
                  : "border-neutral-600 text-transparent"
              }`}
            >
              <Check size={13} strokeWidth={3} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-medium text-white">
                {option.label}
              </span>
              <span className="mt-0.5 block text-xs leading-4 text-neutral-400">
                {option.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
