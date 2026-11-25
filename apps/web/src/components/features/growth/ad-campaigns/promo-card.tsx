"use client";

import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  Megaphone,
  Pencil,
  Send,
  Trash2,
} from "lucide-react";
import { normalizeTelegramPostMediaItems } from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import type { Promo } from "@/lib/api";
import {
  CardActionsMenu,
  CardMenuAction,
} from "@/components/ui/card-actions-menu";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import { PromoQuickSendModal } from "./promo-quick-send-modal";
import { renderPromoInviteLink } from "./promo-invite-template";

export function PromoCard({
  promo,
  onEdit,
  onDelete,
  onToggleArchive,
  botActions,
}: {
  promo: Promo;
  onEdit: () => void;
  onDelete?: () => void;
  botActions?: { onPlace?: () => void; onAnalytics: () => void };
  onToggleArchive?: () => void;
}) {
  const [quickSendOpen, setQuickSendOpen] = useState(false);
  const imageUrls = promo.imageUrls?.length
    ? promo.imageUrls
    : promo.previewImageUrl
      ? [promo.previewImageUrl]
      : promo.imageData
        ? [promo.imageData]
        : [];
  const post = {
    text: promo.text || promo.previewText || "",
    plainText: promo.plainText,
    formattedHtml: promo.formattedHtml,
    imageUrls,
    mediaItems: normalizeTelegramPostMediaItems(promo.mediaItems, imageUrls),
    buttonRows: promo.buttonRows ?? [],
  };
  const previewPost = promo.defaultInviteLink?.url
    ? renderPromoInviteLink(post, promo.defaultInviteLink.url)
    : post;
  const creator = promo.createdByUser?.name?.trim() || "Unknown creator";

  return (
    <article className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/80 transition-colors hover:border-neutral-700">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-neutral-800 px-3 py-2">
        {botActions ? (
          <div className="flex min-w-0 items-center gap-2">
            {promo.iconPresentation ? (
              <IconAvatar icon={promo.iconPresentation} size="xs" decorative />
            ) : null}
            <p className="truncate text-sm font-medium" title={promo.title}>
              {promo.title}
            </p>
          </div>
        ) : (
          <p
            className="min-w-0 truncate text-xs text-neutral-400"
            title={`Created by ${creator}`}
          >
            Created by{" "}
            <span className="font-medium text-neutral-200">{creator}</span>
          </p>
        )}
        <div className="shrink-0">
          <CardActionsMenu label={`Actions for ${promo.title}`}>
            <CardMenuAction
              label="Edit"
              icon={<Pencil size={16} />}
              onClick={onEdit}
            />
            {botActions?.onPlace ? (
              <CardMenuAction
                label="Create placement"
                icon={<Megaphone size={16} />}
                onClick={botActions.onPlace}
              />
            ) : null}
            {botActions ? (
              <CardMenuAction
                label="View analytics"
                icon={<BarChart3 size={16} />}
                onClick={botActions.onAnalytics}
              />
            ) : (
              <CardMenuAction
                label="Send to bot"
                icon={<Send size={16} />}
                onClick={() => setQuickSendOpen(true)}
              />
            )}
            <CardMenuAction
              label={promo.archivedAt ? "Restore from archive" : "Archive"}
              icon={
                promo.archivedAt ? (
                  <ArchiveRestore size={16} />
                ) : (
                  <Archive size={16} />
                )
              }
              onClick={() => onToggleArchive?.()}
            />
            {onDelete ? (
              <CardMenuAction
                danger
                label="Delete"
                icon={<Trash2 size={16} />}
                onClick={onDelete}
              />
            ) : null}
          </CardActionsMenu>
        </div>
      </div>
      <TelegramPostPreview
        channelTitle={promo.telegramChannel?.title || "Telegram channel"}
        channelPhotoUrl={promo.telegramChannel?.photoUrl}
        {...previewPost}
        compact
      />
      {quickSendOpen ? (
        <PromoQuickSendModal
          promo={promo}
          onClose={() => setQuickSendOpen(false)}
        />
      ) : null}
    </article>
  );
}
