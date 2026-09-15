"use client";

import {
  Children,
  isValidElement,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { Archive, Check, RotateCcw, Settings, Trash2 } from "lucide-react";
import type { CurrencySettings, TelegramChannel } from "@/lib/api";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
  TelegramCardMenuLink,
} from "./telegram-card-actions-menu";
import { ChannelSettingsModal } from "./channel-settings-modal";
import { getOverallChannelSettingsCompletion } from "./channel-settings-completion";

export function ChannelMenuAction({
  label,
  icon,
  onClick,
  danger = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: MouseEventHandler<HTMLButtonElement>;
  danger?: boolean;
}) {
  return (
    <TelegramCardMenuAction
      label={label}
      icon={icon}
      onClick={onClick}
      danger={danger}
    />
  );
}

export function ChannelMenuLink({
  label,
  href,
  icon,
}: {
  label: string;
  href: string;
  icon: ReactNode;
}) {
  return <TelegramCardMenuLink label={label} href={href} icon={icon} />;
}

export function ChannelActionsMenu({
  channel,
  currencySettings,
  archived,
  canArchive,
  onArchive,
  onRestore,
  onDelete,
  children,
}: {
  channel: TelegramChannel;
  currencySettings?: CurrencySettings | null;
  archived: boolean;
  canArchive: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuChildren = Children.toArray(children);
  const postsIndex = menuChildren.findIndex(
    (child) =>
      isValidElement<{ label?: string }>(child) &&
      child.props.label === "Posts",
  );
  const editEconomicsIndex =
    postsIndex >= 0 ? postsIndex + 1 : menuChildren.length;
  const setupPercent = getOverallChannelSettingsCompletion(channel, {
    includeBot: canArchive,
  }).percent;
  const setupLabel = `Channel setup ${setupPercent}%. Open settings`;

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={setupLabel}
          title={setupLabel}
          onClick={() => setSettingsOpen(true)}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            setupPercent === 100
              ? "text-emerald-950 hover:bg-emerald-400/10"
              : "hover:bg-neutral-800"
          }`}
        >
          {setupPercent === 100 ? (
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400">
              <Check size={11} strokeWidth={3} aria-hidden="true" />
            </span>
          ) : (
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(rgb(59 130 246) ${setupPercent}%, rgb(64 64 64) ${setupPercent}% 100%)`,
              }}
            >
              <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-neutral-900 text-[9px] font-semibold leading-none text-neutral-200">
                {setupPercent}
              </span>
            </span>
          )}
        </button>
        <TelegramCardActionsMenu label={`Actions for ${channel.title}`}>
          {menuChildren.slice(0, editEconomicsIndex)}
          <ChannelMenuAction
            label="Settings"
            icon={<Settings size={17} />}
            onClick={() => setSettingsOpen(true)}
          />
          {menuChildren.slice(editEconomicsIndex)}
          <div className="my-1 border-t border-neutral-800" />
          {archived ? (
            <ChannelMenuAction
              label="Restore channel"
              icon={<RotateCcw size={17} />}
              onClick={onRestore}
            />
          ) : canArchive ? (
            <ChannelMenuAction
              label="Archive channel"
              icon={<Archive size={17} />}
              onClick={onArchive}
            />
          ) : null}
          <ChannelMenuAction
            label="Delete channel"
            icon={<Trash2 size={17} />}
            onClick={onDelete}
            danger
          />
        </TelegramCardActionsMenu>
      </div>
      {settingsOpen ? (
        <ChannelSettingsModal
          channel={channel}
          currencySettings={currencySettings}
          canManageBot={canArchive}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </>
  );
}
