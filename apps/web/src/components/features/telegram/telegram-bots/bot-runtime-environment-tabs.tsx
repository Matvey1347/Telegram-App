"use client";

import type { TelegramBotRuntimeEnvironment } from "@telegram-system/shared";
import { Headphones, Laptop, Server } from "lucide-react";

const runtimeTabs = [
  { value: "PRODUCTION", label: "Production", Icon: Server },
  { value: "LOCAL", label: "Local", Icon: Laptop },
] as const;

const tabClass = (selected: boolean) =>
  `inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selected ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"} disabled:cursor-not-allowed disabled:opacity-45`;

export function BotRuntimeEnvironmentTabs({
  environment,
  availableEnvironments,
  onChange,
  label = "Bot runtime environment",
  support,
}: {
  environment: TelegramBotRuntimeEnvironment;
  availableEnvironments: readonly TelegramBotRuntimeEnvironment[];
  onChange: (environment: TelegramBotRuntimeEnvironment) => void;
  label?: string;
  support?: {
    selected: boolean;
    open?: number;
    needsReply?: number;
    onSelect: () => void;
  };
}) {
  if (!support && availableEnvironments.length < 2) return null;

  return (
    <div
      className="mt-2 inline-flex max-w-full flex-wrap rounded-lg border border-neutral-800 bg-neutral-900 p-0.5"
      role="tablist"
      aria-label={label}
    >
      {runtimeTabs.map(({ value: option, label: title, Icon }) => {
        const available = availableEnvironments.includes(option);
        const selected = !support?.selected && environment === option;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={!available}
            onClick={() => onChange(option)}
            className={tabClass(selected)}
          >
            <Icon size={14} aria-hidden="true" />
            {title}
          </button>
        );
      })}
      {support && (
        <button
          type="button"
          role="tab"
          aria-selected={support.selected}
          onClick={support.onSelect}
          className={tabClass(support.selected)}
        >
          <Headphones size={14} aria-hidden="true" />
          Support
          {support.open !== undefined && (
            <span
              className={
                support.needsReply ? "text-amber-300" : "text-neutral-400"
              }
            >
              {support.open}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
