import type { Dispatch, SetStateAction } from "react";
import type { TelegramAdAvailabilitySlot } from "@telegram-system/shared";
import type { PublishedPostOption, SalePlacementDraft } from "./ad-sale-types";

export function useAdSalePlacementLoaders({
  onLoadAvailableSlots,
  onLoadPublishedPosts,
  postsLoadingByPlacement,
  setPostsLoadingByPlacement,
  setPublishedPostsByPlacement,
  setSlotPickerPlacementKey,
  setSlotPickerSlots,
  setSlotPickerLoading,
  setSlotPickerError,
}: {
  onLoadAvailableSlots: (input: {
    channelId: string;
    productId?: string;
    from: string;
    to: string;
  }) => Promise<TelegramAdAvailabilitySlot[]>;
  onLoadPublishedPosts: (input: {
    channelId: string;
    date: string;
    timezone: string;
    telegramPostUrl?: string;
  }) => Promise<PublishedPostOption[]>;
  postsLoadingByPlacement: Record<string, boolean>;
  setPostsLoadingByPlacement: Dispatch<SetStateAction<Record<string, boolean>>>;
  setPublishedPostsByPlacement: Dispatch<
    SetStateAction<Record<string, PublishedPostOption[]>>
  >;
  setSlotPickerPlacementKey: Dispatch<SetStateAction<string | null>>;
  setSlotPickerSlots: Dispatch<SetStateAction<TelegramAdAvailabilitySlot[]>>;
  setSlotPickerLoading: Dispatch<SetStateAction<boolean>>;
  setSlotPickerError: Dispatch<SetStateAction<string>>;
}) {
  async function loadPublishedPosts(
    placement: SalePlacementDraft,
    telegramPostUrl?: string,
  ): Promise<PublishedPostOption | null> {
    const cacheKey = `${placement.channelId}:${placement.date}`;
    if (postsLoadingByPlacement[cacheKey]) return null;
    setPostsLoadingByPlacement((current) => ({ ...current, [cacheKey]: true }));
    try {
      const posts = await onLoadPublishedPosts({
        channelId: placement.channelId,
        date: placement.date,
        timezone: placement.timezone,
        telegramPostUrl,
      });
      setPublishedPostsByPlacement((current) => ({
        ...current,
        [cacheKey]: telegramPostUrl
          ? [
              ...new Map(
                [...(current[cacheKey] ?? []), ...posts].map((post) => [
                  post.id,
                  post,
                ]),
              ).values(),
            ]
          : posts,
      }));
      return posts[0] ?? null;
    } catch {
      setPublishedPostsByPlacement((current) => ({ ...current, [cacheKey]: [] }));
      return null;
    } finally {
      setPostsLoadingByPlacement((current) => ({ ...current, [cacheKey]: false }));
    }
  }

  async function openSlotPicker(placement: SalePlacementDraft) {
    setSlotPickerPlacementKey(placement.key);
    setSlotPickerSlots([]);
    setSlotPickerError("");
    setSlotPickerLoading(true);
    try {
      const start = new Date(`${placement.date}T00:00:00`);
      start.setDate(start.getDate() - 7);
      const end = new Date(`${placement.date}T23:59:59`);
      end.setDate(end.getDate() + 21);
      setSlotPickerSlots(
        await onLoadAvailableSlots({
          channelId: placement.channelId,
          productId: placement.productId || undefined,
          from: start.toISOString(),
          to: end.toISOString(),
        }),
      );
    } catch (error) {
      setSlotPickerError(
        error instanceof Error ? error.message : "Could not load available slots.",
      );
    } finally {
      setSlotPickerLoading(false);
    }
  }

  return { loadPublishedPosts, openSlotPicker };
}
