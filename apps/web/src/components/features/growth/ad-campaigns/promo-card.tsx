"use client";

import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Promo } from "@/lib/api";
import {
  CardActionsMenu,
  CardMenuAction,
} from "@/components/ui/card-actions-menu";
import { renderTelegramPreviewInlineMarkup } from "@/components/features/telegram/telegram/telegram-post-preview-markup";

export function PromoCard({
  promo,
  icon,
  channel,
  member,
  onEdit,
  onDelete,
}: {
  promo: Promo;
  icon?: ReactNode;
  channel?: ReactNode;
  member?: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const openingText =
    promo.previewText?.trim() || promo.plainText?.trim() || promo.text?.trim();

  return (
    <article className="group relative min-h-48 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/80 transition duration-200 hover:border-neutral-700">
      <button
        type="button"
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-neutral-600"
        aria-label={`Edit promo ${promo.title}`}
        onClick={onEdit}
      />
      <div className="pointer-events-none relative z-10 flex h-full flex-col p-4">
        <div className="flex min-w-0 items-start gap-2 pr-9">
          {icon}
          <h3 className="truncate text-base font-semibold text-white">
            {promo.title}
          </h3>
        </div>
        {channel || member ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {channel}
            {member}
          </div>
        ) : null}
        {promo.previewImageUrl ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
            <img
              src={promo.previewImageUrl}
              alt=""
              className="block h-auto w-full"
            />
          </div>
        ) : null}
        <div className="mt-4 border-t border-white/10 pt-3">
          {openingText ? (
            <div
              className="line-clamp-3 whitespace-pre-line text-sm leading-5 text-neutral-300 [&_b]:font-semibold [&_b]:text-neutral-100"
              dangerouslySetInnerHTML={{
                __html: renderTelegramPreviewInlineMarkup(openingText),
              }}
            />
          ) : (
            <p className="text-sm leading-5 text-neutral-300">
              No creative text yet.
            </p>
          )}
        </div>
      </div>
      <div className="absolute right-3 top-3 z-20">
        <CardActionsMenu label={`Actions for ${promo.title}`}>
          <CardMenuAction
            label="Edit"
            icon={<Pencil size={16} />}
            onClick={onEdit}
          />
          <CardMenuAction
            danger
            label="Delete"
            icon={<Trash2 size={16} />}
            onClick={onDelete}
          />
        </CardActionsMenu>
      </div>
    </article>
  );
}
