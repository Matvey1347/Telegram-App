"use client";

import { Check, Link2, TextCursorInput } from "lucide-react";
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
      <section
        className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 sm:col-span-2"
        aria-labelledby="channel-title-link-label"
      >
        <h4
          id="channel-title-link-label"
          className="text-sm font-medium text-white"
        >
          Channel title link
        </h4>
        <p className="mt-0.5 text-xs text-neutral-400">
          Embed the link in the title or show the title and URL separately.
        </p>
        <div
          className="mt-3 grid gap-2 sm:grid-cols-2"
          role="radiogroup"
          aria-label="Channel title link style"
        >
          {[
            {
              mode: "EMBEDDED" as const,
              label: "Title as link",
              description: "📣 Title is the clickable link",
              Icon: Link2,
            },
            {
              mode: "SEPARATE" as const,
              label: "Title — link",
              description: "📣 Title — 🔗 link",
              Icon: TextCursorInput,
            },
          ].map(({ mode, label, description, Icon }) => {
            const selected = value.titleLinkMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-label={label}
                aria-checked={selected}
                onClick={() => onChange({ ...value, titleLinkMode: mode })}
                className={`flex min-h-16 items-center gap-3 rounded-lg border p-3 text-left transition ${
                  selected
                    ? "border-blue-500/70 bg-blue-500/10 text-white"
                    : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700"
                }`}
              >
                <span
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                    selected
                      ? "bg-blue-500/20 text-blue-300"
                      : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="mt-0.5 block truncate text-xs text-neutral-400">
                    {description}
                  </span>
                </span>
                {selected ? (
                  <Check
                    className="ml-auto shrink-0 text-blue-300"
                    size={16}
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
