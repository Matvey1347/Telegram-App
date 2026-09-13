"use client";

import {
  Children,
  isValidElement,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { Archive, RotateCcw, Settings, Trash2 } from "lucide-react";
import type { CurrencySettings, TelegramChannel } from "@/lib/api";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
  TelegramCardMenuLink,
} from "./telegram-card-actions-menu";
import { ChannelSettingsModal } from "./channel-settings-modal";

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

  return (
    <>
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
