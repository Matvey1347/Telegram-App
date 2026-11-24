"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Pencil, Send, Trash2 } from "lucide-react";
import { normalizeTelegramPostMediaItems } from "@telegram-system/shared";
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
}: {
  promo: Promo;
  onEdit: () => void;
  onDelete: () => void;
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
    text: promo.text || "",
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
        <p
          className="min-w-0 truncate text-xs text-neutral-400"
          title={`Created by ${creator}`}
        >
          Created by{" "}
          <span className="font-medium text-neutral-200">{creator}</span>
        </p>
        <div className="shrink-0">
          <CardActionsMenu label={`Actions for ${promo.title}`}>
            <CardMenuAction
              label="Edit"
              icon={<Pencil size={16} />}
              onClick={onEdit}
            />
            <CardMenuAction
              label="Send to bot"
              icon={<Send size={16} />}
              onClick={() => setQuickSendOpen(true)}
            />
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
            <CardMenuAction
              danger
              label="Delete"
              icon={<Trash2 size={16} />}
              onClick={onDelete}
            />
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
