"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TelegramSourceChannelAccess } from "@/lib/api";
import { ChannelPreview } from "@/components/features/telegram/telegram/channel-preview";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import {
  EmptyState,
  LoadingState,
  Modal,
  TooltipBubble,
} from "@/components/ui/primitives";

export function TelegramSourceChannelAccessList({
  sourceId,
  sourceType,
  queryFn,
}: {
  sourceId: string;
  sourceType: "BOT" | "MTPROTO";
  queryFn: () => Promise<TelegramSourceChannelAccess[]>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<TelegramSourceChannelAccess | null>(
    null,
  );
  const {
    data = [],
    isLoading,
    error,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["telegram-source-channels", sourceType, sourceId],
    queryFn,
    enabled: modalOpen,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="mt-4 border-t border-slate-800 pt-3">
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-0 py-1 text-left transition hover:text-blue-300"
      >
        <span className="text-sm font-semibold text-slate-200">
          Channel access
        </span>
        <span className="text-xs text-slate-400">
          {isLoading
            ? "Loading..."
            : dataUpdatedAt
              ? `${data.length} channels`
              : "View channels"}
        </span>
      </button>
      <SourceChannelsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        channels={data}
        isLoading={isLoading}
        error={error}
        onSelect={setSelected}
      />
      <ChannelAccessModal
        access={selected}
        sourceType={sourceType}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function SourceChannelsModal({
  open,
  onClose,
  channels,
  isLoading,
  error,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  channels: TelegramSourceChannelAccess[];
  isLoading: boolean;
  error: unknown;
  onSelect: (channel: TelegramSourceChannelAccess) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Channel access">
      <div className="space-y-3">
        {isLoading && !channels.length ? <LoadingState /> : null}
        {!isLoading && !error && !channels.length ? (
          <EmptyState text="No synced channel access yet." />
        ) : null}
        {channels.map((channel) => (
          <button
            key={channel.channelId}
            type="button"
            onClick={() => onSelect(channel)}
            className="w-full rounded-md border border-slate-800 bg-slate-900/40 p-3 text-left hover:border-slate-600"
          >
            <div className="flex items-center gap-2">
              <TelegramEntityAvatar
                imageUrl={channel.avatarUrl}
                kind="channel"
                alt={channel.title}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {channel.title}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {channel.username
                    ? `@${channel.username}`
                    : channel.telegramChannelId || channel.channelId}
                </p>
              </div>
              <AccessBadge
                label={formatRole(channel.role)}
                tip={roleTooltip(channel.role, channel.sourceType)}
              />
            </div>
            <div
              className={`mt-2 flex flex-wrap items-center gap-1 text-xs ${channel.canBeUsedForAnalytics ? "text-emerald-300" : "text-amber-300"}`}
            >
              <span>
                {channel.canBeUsedForAnalytics
                  ? "Can be used for analytics"
                  : "Not enough access for analytics"}
              </span>
              <PermissionSummaryBadges
                permissions={channel.permissions}
                role={channel.role}
                sourceType={channel.sourceType}
              />
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function ChannelAccessModal({
  access,
  sourceType,
  onClose,
}: {
  access: TelegramSourceChannelAccess | null;
  sourceType: "BOT" | "MTPROTO";
  onClose: () => void;
}) {
  if (!access) return null;
  const permissions = [
    ["Can create/publish posts", access.permissions.canPostMessages],
    ["Can edit posts", access.permissions.canEditMessages],
    ["Can delete posts", access.permissions.canDeleteMessages],
    ["Can invite users", access.permissions.canInviteUsers],
    ["Can manage invite links", access.permissions.canManageInviteLinks],
    ["Can view/export analytics", access.permissions.canViewStats],
  ] as const;

  return (
    <Modal open={!!access} onClose={onClose} title="Channel access">
      <div className="space-y-4 text-sm">
        <ChannelPreview
          channel={{
            title: access.title,
            username: access.username || undefined,
            telegramChatId: access.telegramChannelId || undefined,
            photoUrl: access.avatarUrl || undefined,
            currentSubscribersCount:
              access.currentSubscribersCount ?? undefined,
          }}
        />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <AccessField label="Source type" value={sourceType} />
          <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2">
            <p className="text-xs text-slate-400">Role</p>
            <div className="mt-1">
              <AccessBadge
                label={formatRole(access.role)}
                tip={roleTooltip(access.role, sourceType)}
              />
            </div>
          </div>
          <AccessField
            label="Channel ID"
            value={access.telegramChannelId || access.channelId}
          />
          <AccessField
            label="Analytics"
            value={
              access.canBeUsedForAnalytics
                ? "Can be used for analytics"
                : "Not enough access for analytics"
            }
          />
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
          <p className="mb-2 font-medium text-slate-200">Permissions</p>
          <p className="mb-3 text-xs text-slate-400">
            {inviteLinksVisibility(access.role, sourceType)}
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {permissions.map(([label, enabled]) => (
              <p
                key={label}
                className={enabled ? "text-emerald-300" : "text-slate-500"}
              >
                {enabled ? "Yes" : "No"} · {label}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AccessField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-medium text-slate-100">{value || "-"}</p>
    </div>
  );
}

export function formatRole(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function PermissionSummaryBadges({
  permissions,
  role,
  sourceType,
}: {
  permissions: TelegramSourceChannelAccess["permissions"];
  role: string;
  sourceType: string;
}) {
  const fullAccess = hasFullAccess(permissions, role);
  if (fullAccess) {
    return (
      <>
        <span className="text-slate-500">·</span>
        <AccessBadge
          label="Full access"
          tip={fullAccessTooltip(role, sourceType)}
          tone="success"
        />
        <AccessBadge
          label={inviteLinksBadgeLabel(role, sourceType)}
          tip={inviteLinksVisibility(role, sourceType)}
          tone="info"
        />
      </>
    );
  }
  const labels = [
    permissions.canPostMessages ? "post" : null,
    permissions.canEditMessages ? "edit" : null,
    permissions.canDeleteMessages ? "delete" : null,
    permissions.canManageInviteLinks
      ? inviteLinksBadgeLabel(role, sourceType)
      : null,
    permissions.canViewStats ? "stats" : null,
  ].filter(Boolean);

  return (
    <span>
      {labels.length ? `· ${labels.join(", ")}` : "· unknown permissions"}
    </span>
  );
}

export function AccessBadge({
  label,
  tip,
  tone = "default",
}: {
  label: string;
  tip: string;
  tone?: "default" | "success" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-700 text-emerald-200"
      : tone === "info"
        ? "border-blue-700 text-blue-200"
        : "border-slate-700 text-slate-200";

  return (
    <span
      className={`group relative inline-flex rounded border px-2 py-0.5 text-xs ${toneClass}`}
    >
      {label}
      <TooltipBubble
        side="top"
        align="left"
        className="hidden w-64 border-slate-700 bg-slate-950 px-2 py-1.5 text-xs leading-relaxed text-slate-100 group-hover:block"
      >
        {tip}
      </TooltipBubble>
    </span>
  );
}

function hasFullAccess(
  permissions: TelegramSourceChannelAccess["permissions"],
  role: string,
) {
  return (
    role === "OWNER" ||
    (role === "ADMIN" &&
      permissions.canPostMessages &&
      permissions.canEditMessages &&
      permissions.canDeleteMessages &&
      permissions.canManageInviteLinks &&
      permissions.canViewStats)
  );
}

export function roleTooltip(role: string, sourceType: string) {
  if (role === "OWNER")
    return "Owner has the highest channel access: can manage posts, admins, stats, and all invite links when Telegram returns these permissions.";
  if (role === "ADMIN")
    return `Admin access depends on granted Telegram rights. This ${sourceType === "BOT" ? "bot" : "account"} may publish, edit, delete, invite, or view stats only if those rights are enabled.`;
  if (role === "MEMBER")
    return "Member access is not enough for analytics unless Telegram grants specific admin-level rights.";
  return "Unknown means Telegram did not return a clear channel role for this source.";
}

function fullAccessTooltip(role: string, sourceType: string) {
  const inviteLinks = inviteLinksVisibility(role, sourceType);
  return `Full access means this source has all meaningful analytics permissions currently tracked: publish, edit, delete, invite links, and stats. ${inviteLinks}`;
}

function inviteLinksBadgeLabel(role: string, sourceType: string) {
  if (role === "OWNER") return "All invite links";
  if (sourceType === "BOT") return "Own bot links only";
  return "Own admin links only";
}

function inviteLinksVisibility(role: string, sourceType: string) {
  if (role === "OWNER")
    return "Invite links: owner access can see all channel invite links.";
  if (sourceType === "BOT")
    return "Invite links: bots can see only invite links created by this bot.";
  return "Invite links: admins can see only invite links created by this admin account.";
}
