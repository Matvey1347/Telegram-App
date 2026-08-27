"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { CalendarSearch, FilePenLine, MoreHorizontal, Settings2 } from "lucide-react";
import type { TelegramAdProduct } from "@telegram-system/shared";
import type { TelegramChannel } from "@/lib/api";
import {
  DateInput,
  FormField,
  Input,
  Select,
  Textarea,
  TimeInput,
} from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import {
  buildUnderpricingSummary,
  channelLocalTime,
  isValidZonedDateTimeInput,
  zonedDateTimeToUtc,
} from "@/lib/features/growth/telegram-ad-sales";
import { applyProductToPlacement } from "./ad-sale-placement-draft";
import type { PublishedPostOption, SalePlacementDraft } from "./ad-sale-types";
import { PlacementPostComposer } from "./placement-post/placement-post-composer";

export function AdSalePlacementCard({
  placement,
  channel,
  products,
  currency,
  priceLocked,
  sharedPostActive,
  publishedPosts,
  postsLoading,
  setPlacements,
  onFindNearbyDate,
  onLoadPublishedPosts,
  onManualPriceEdit,
}: {
  placement: SalePlacementDraft;
  channel?: TelegramChannel;
  products: TelegramAdProduct[];
  currency: string;
  priceLocked: boolean;
  sharedPostActive: boolean;
  publishedPosts: PublishedPostOption[];
  postsLoading: boolean;
  setPlacements: Dispatch<SetStateAction<SalePlacementDraft[]>>;
  onFindNearbyDate: () => void;
  onLoadPublishedPosts: (telegramPostUrl?: string) => Promise<PublishedPostOption | null>;
  onManualPriceEdit: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [renderedAt] = useState(() => Date.now());
  const product = products.find((item) => item.id === placement.productId);
  const priceSummary = buildUnderpricingSummary({
    agreedPrice: placement.agreedPrice,
    recommendedPrice: placement.recommendedPrice,
    minimumPrice: placement.minimumPrice,
  });
  const isPastPlacement =
    isValidZonedDateTimeInput(placement.date, placement.time) &&
    zonedDateTimeToUtc(
      placement.date,
      placement.time,
      placement.timezone,
    ).getTime() < renderedAt;
  const showPostComposer = isPastPlacement || postOpen;
  const update = (next: (item: SalePlacementDraft) => SalePlacementDraft) =>
    setPlacements((current) =>
      current.map((item) => (item.key === placement.key ? next(item) : item)),
    );

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TelegramEntityAvatar
            imageUrl={channel?.photoUrl}
            alt={channel?.title ?? placement.channelId}
            kind="channel"
            size="xs"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {channel?.title ?? placement.channelId}
            </p>
            <p className="truncate text-xs text-neutral-400">
              {placement.date} · {placement.time} · {product?.name ?? "Default"} ·{" "}
              {placement.agreedPrice} {currency}
            </p>
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label={`Actions for ${channel?.title ?? placement.channelId}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <MoreHorizontal size={18} />
          </button>
          {menuOpen ? (
            <div className="absolute bottom-9 right-0 z-30 min-w-48 rounded-lg border border-neutral-700 bg-neutral-950 p-1 shadow-2xl">
              <MenuButton
                icon={Settings2}
                onClick={() => runMenuAction(() => setDetailsOpen((value) => !value))}
              >
                {detailsOpen ? "Hide channel settings" : "Edit channel settings"}
              </MenuButton>
              <MenuButton icon={CalendarSearch} onClick={() => runMenuAction(onFindNearbyDate)}>
                Find nearby date
              </MenuButton>
              {!isPastPlacement ? (
                <MenuButton
                  icon={FilePenLine}
                  onClick={() => runMenuAction(() => setPostOpen((value) => !value))}
                >
                  {postOpen
                    ? "Hide post"
                    : sharedPostActive
                      ? "Edit channel post"
                      : "Configurate post"}
                </MenuButton>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {detailsOpen ? (
        <div className="mt-3 grid gap-3 border-t border-neutral-800 pt-3 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="Date">
            <DateInput
              value={placement.date}
              onChange={(event) =>
                update((item) => ({
                  ...item,
                  date: event.target.value,
                  inventoryOpportunityKey: null,
                  telegramPostId: null,
                }))
              }
            />
          </FormField>
          <FormField label="Time">
            <TimeInput
              value={placement.time}
              onChange={(event) =>
                update((item) => ({ ...item, time: event.target.value }))
              }
            />
          </FormField>
          <FormField label="Format">
            <Select
              value={placement.productId}
              onChange={(event) => {
                const nextProduct = products.find(
                  (candidate) => candidate.id === event.target.value,
                );
                update((item) => applyProductToPlacement(item, nextProduct));
              }}
            >
              <option value="">Default</option>
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Price">
            <div className="space-y-1">
              <Input
                value={placement.agreedPrice}
                inputMode="decimal"
                aria-describedby={priceLocked ? `${placement.key}-price-mode` : undefined}
                onChange={(event) => {
                  if (priceLocked) onManualPriceEdit();
                  update((item) => ({
                    ...item,
                    agreedPrice: event.target.value,
                    agreedPriceManuallyEdited: true,
                  }));
                }}
              />
              {priceLocked ? (
                <p id={`${placement.key}-price-mode`} className="text-xs text-neutral-500">
                  Editing switches pricing to Per channel.
                </p>
              ) : null}
              <p className="text-xs text-emerald-300">
                Recommended: {placement.recommendedPrice} {currency}
              </p>
            </div>
          </FormField>
        </div>
      ) : null}

      {showPostComposer ? (
        <div className="mt-3 border-t border-neutral-800 pt-3">
          <PlacementPostComposer
            channelTitle={channel?.title ?? "Channel"}
            channelPhotoUrl={channel?.photoUrl}
            draft={placement.managedPostDraft}
            existingPostId={placement.telegramPostId}
            publishedPosts={publishedPosts.map((post) => ({
              ...post,
              title: `${channelLocalTime(post.publishedAt, placement.timezone)} · ${post.title}`,
            }))}
            postsLoading={postsLoading}
            canCreate={!isPastPlacement}
            autoCreate={false}
            lockToDraft={sharedPostActive}
            onLoadPublishedPosts={onLoadPublishedPosts}
            onChange={({ draft, telegramPostId, publishedAt }) =>
              update((item) => ({
                ...item,
                managedPostDraft: draft ?? null,
                telegramPostId: telegramPostId ?? null,
                time: publishedAt
                  ? channelLocalTime(publishedAt, item.timezone)
                  : item.time,
              }))
            }
          />
        </div>
      ) : null}

      {priceSummary.isBelowMinimum ? (
        <div className="mt-3">
          <FormField label="Reason for low price" required>
            <Textarea
              rows={2}
              value={placement.manualPriceReason}
              onChange={(event) =>
                update((item) => ({
                  ...item,
                  manualPriceReason: event.target.value,
                }))
              }
            />
          </FormField>
        </div>
      ) : null}

      {placement.conflict ? (
        <p className="mt-3 rounded-lg border border-rose-700 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
          {placement.conflict}
        </p>
      ) : null}
    </article>
  );
}

function MenuButton({
  children,
  icon: Icon,
  onClick,
}: {
  children: React.ReactNode;
  icon: typeof Settings2;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 hover:text-white"
    >
      <Icon size={16} className="shrink-0 text-neutral-400" aria-hidden="true" />
      {children}
    </button>
  );
}
