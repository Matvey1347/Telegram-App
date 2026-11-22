export type TelegramPostsRouteView =
  | "editor"
  | "calendar"
  | "ai-posting"
  | "groups"
  | "hypotheses";

export function parseTelegramPostsView(
  value: string | null,
): TelegramPostsRouteView | null {
  return value === "editor" ||
    value === "calendar" ||
    value === "ai-posting" ||
    value === "groups" ||
    value === "hypotheses"
    ? value
    : null;
}

type TelegramPostsUrlInput = {
  channelId?: string | null;
  postId?: string | null;
  groupId?: string | null;
  postView?: TelegramPostsRouteView | null;
  extraParams?: URLSearchParams | string | null;
};

const ownedTelegramPostsParams = ["channelId", "postId", "groupId", "postView"];

function trimValue(value?: string | null) {
  return value?.trim() || "";
}

function appendQuery(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function buildTelegramPostsUrl({
  channelId,
  postId,
  postView,
  extraParams,
}: TelegramPostsUrlInput) {
  const params = new URLSearchParams(extraParams?.toString() ?? "");
  for (const key of ownedTelegramPostsParams) {
    params.delete(key);
  }

  const normalizedChannelId = trimValue(channelId);
  const normalizedPostId = trimValue(postId);
  if (normalizedPostId) params.set("postId", normalizedPostId);

  if (normalizedChannelId) {
    const view =
      postView === "editor" || postView === "calendar" || postView === "ai-posting"
        ? postView
        : normalizedPostId
          ? "editor"
          : "ai-posting";
    return appendQuery(
      `/telegram-posts/${encodeURIComponent(normalizedChannelId)}/${view}`,
      params,
    );
  }

  if (postView) params.set("postView", postView);
  return appendQuery("/telegram-posts", params);
}

export function buildTelegramPostsLegacyRedirectUrl(
  searchParams: URLSearchParams | Pick<URLSearchParams, "get" | "toString">,
) {
  const channelId = trimValue(searchParams.get("channelId"));
  if (!channelId) return null;
  const postView = parseTelegramPostsView(searchParams.get("postView"));
  return buildTelegramPostsUrl({
    channelId,
    postId: searchParams.get("postId"),
    postView,
    extraParams: searchParams.toString(),
  });
}
