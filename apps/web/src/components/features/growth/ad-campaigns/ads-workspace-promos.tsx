"use client";

import { IconAvatar } from "@/components/icons/icon-avatar";
import { type Promo } from "@/lib/api";
import {
  EmptyState,
  LoadingState,
  MasonryGrid,
} from "@/components/ui/primitives";
import { PromoCard } from "@/components/features/growth/ad-campaigns/promo-card";

import { SourceChip } from "./ads-workspace-source-chip";

export function PromosSection({
  promos,
  loading,
  error,
  onEdit,
  onDelete,
  onToggleArchive,
}: {
  promos: Promo[];
  loading: boolean;
  error: unknown;
  onEdit: (promo: Promo) => void;
  onDelete: (promo: Promo) => void;
  onToggleArchive: (promo: Promo) => void;
}) {
  return (
    <>
      {loading ? <LoadingState /> : null}
      {error ? (
        <div className="mb-4 rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load promos.
        </div>
      ) : null}
      {!loading && !error && !promos.length ? (
        <EmptyState text="No promos yet." />
      ) : null}
      {promos.length ? (
        <MasonryGrid className="xl:grid-cols-4">
          {promos.map((promo) => (
            <PromoCard
              key={promo.id}
              promo={promo}
              icon={
                <PromoIcon
                  iconId={promo.iconId}
                  icon={promo.iconPresentation}
                  title={promo.title}
                />
              }
              channel={
                promo.telegramChannel ? (
                  <SourceChip source={promo.telegramChannel} compact />
                ) : null
              }
              member={
                promo.assignedMember ? (
                  <PromoAssignedMemberChip member={promo.assignedMember} />
                ) : null
              }
              onEdit={() => onEdit(promo)}
              onDelete={() => onDelete(promo)}
              onToggleArchive={() => onToggleArchive(promo)}
            />
          ))}
        </MasonryGrid>
      ) : null}
    </>
  );
}

function PromoIcon({
  iconId,
  icon,
  title,
}: {
  iconId?: string | null;
  icon?: Promo["iconPresentation"];
  title: string;
}) {
  const resolvedIcon = icon;
  if (!resolvedIcon) return null;
  return (
    <IconAvatar
      icon={resolvedIcon}
      label={title}
      size="xs"
      bordered={false}
      className="!bg-transparent"
    />
  );
}

function PromoAssignedMemberChip({
  member,
}: {
  member: NonNullable<Promo["assignedMember"]>;
}) {
  const label = member.user?.name || "Member";
  const avatarImageUrl =
    member.avatarPresentation?.type === "image"
      ? member.avatarPresentation.url
      : undefined;
  const avatarEmoji =
    member.avatarPresentation?.type === "unicode"
      ? member.avatarPresentation.value
      : undefined;
  return (
    <a
      href="/workspace-members"
      title={`Assigned member: ${label}\nClick to open workspace members.\nCtrl/Cmd + click opens it in a new tab.`}
      className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
    >
      {avatarImageUrl ? (
        <img
          src={avatarImageUrl}
          alt=""
          className="h-4 w-4 shrink-0 rounded-full object-cover"
        />
      ) : null}
      {!avatarImageUrl && avatarEmoji ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[12px] leading-none">
          {avatarEmoji}
        </span>
      ) : null}
      {!avatarImageUrl && !avatarEmoji ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-400">
          {label.slice(0, 1).toUpperCase()}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </a>
  );
}
