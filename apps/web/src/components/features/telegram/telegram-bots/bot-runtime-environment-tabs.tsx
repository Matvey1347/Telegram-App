"use client";

import type { TelegramBotRuntimeEnvironment } from "@telegram-system/shared";

export function BotRuntimeEnvironmentTabs({
  environment,
  availableEnvironments,
  onChange,
  label = "Bot runtime environment",
}: {
  environment: TelegramBotRuntimeEnvironment;
  availableEnvironments: readonly TelegramBotRuntimeEnvironment[];
  onChange: (environment: TelegramBotRuntimeEnvironment) => void;
  label?: string;
}) {
  if (availableEnvironments.length < 2) return null;

  return (
    <div
      className="mt-2 inline-flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5"
      role="tablist"
      aria-label={label}
    >
      {(["PRODUCTION", "LOCAL"] as const).map((option) => {
        const available = availableEnvironments.includes(option);
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={environment === option}
            disabled={!available}
            onClick={() => onChange(option)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${environment === option ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"} disabled:cursor-not-allowed disabled:opacity-45`}
          >
            {option === "PRODUCTION" ? "Production" : "Local"}
          </button>
        );
      })}
    </div>
  );
}
