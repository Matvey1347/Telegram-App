import type { Dispatch, SetStateAction } from "react";
import type { PublishedPostOption, SalePlacementDraft } from "./ad-sale-types";

export function useAdSalePlacementLoaders({
  onLoadPublishedPosts,
  postsLoadingByPlacement,
  setPostsLoadingByPlacement,
  setPublishedPostsByPlacement,
}: {
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

  return { loadPublishedPosts };
}
