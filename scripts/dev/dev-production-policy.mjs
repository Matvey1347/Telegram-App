export const productionApiOrigin = "https://api.nexeloq.com";
const id = "[A-Za-z0-9_-]{1,100}";
export const validId = (value) => typeof value === "string" && new RegExp(`^${id}$`, "u").test(value);
const post = `managed-posts/${id}`;
const channelRead = new RegExp(
  `^(?:|/(?:analytics|analytics-sources|audience|audience-snapshots|stats-snapshots|traffic-attribution|publishing-capabilities|post-group-summaries|posts(?:/select)?|invite-links(?:/select|/${id}/history)?|managed-posts(?:/calendar|/${id}(?:/history)?)?|reschedule-managed-posts-plan|recovery-managed-posts-snapshot))$`,
  "u",
);
const channelWrite = {
  POST: new RegExp(`^/(?:managed-posts|${post}/(?:publish(?:-stream)?|schedule(?:-stream)?|return-to-draft|history/${id}/restore))$`, "u"),
  PATCH: new RegExp(`^/${post}$`, "u"),
  DELETE: new RegExp(`^/${post}$`, "u"),
};
const shellRead = new Set([
  "/api/account/shell", "/api/workspace-members/select",
  "/api/auth/me", "/api/workspaces", "/api/workspaces/selected",
  "/api/operations/notifications", "/api/operations/notifications/events/stream",
  "/api/operations/notifications/unread-count",
]);
const operatorRecovery = "/managed-posts/reschedule-all-stream";
const publish = new RegExp(`^/${post}/(?:publish(?:-stream)?|reconcile-published)$`, "u");

export function matchesOperatorIdentity(payload, scope) {
  return payload?.user?.id === scope.userId &&
    payload.workspace?.id === scope.workspaceId &&
    payload.workspace?.access?.isOwner === true;
}

export function productionRoute(mode, method, url, scope) {
  const path = url.pathname;
  // Reject encoded separators, normalization ambiguity, credentials in query,
  // and anything outside the mounted API before forming an upstream URL.
  if (!/^\/api\/[A-Za-z0-9_/-]+$/u.test(path) || path.includes("//")) return;
  for (const key of url.searchParams.keys()) {
    if (/token|secret|password|credential|authorization/iu.test(key)) return;
  }
  if (path === "/api/auth/login" && method === "POST" && !url.search) return { login: true };
  if (method === "GET" && shellRead.has(path)) {
    if (mode === "operator" && path.startsWith("/api/operations/")) return;
    return { shell: true };
  }
  if (mode === "ui" && method === "GET" && ["/api/telegram-channels", "/api/telegram-channels/select"].includes(path)) {
    return { sanitize: true };
  }
  if (mode === "operator" && method === "GET" && ["/api/telegram-channels", "/api/telegram-channels/select"].includes(path)) {
    return { scopedList: true, sanitize: true, local: true };
  }
  if (method === "GET" && path === "/api/telegram-channels/post-groups") {
    if (mode === "operator" && (url.searchParams.getAll("telegramChannelId").length !== 1 ||
      url.searchParams.get("telegramChannelId") !== scope.channelId)) return;
    return { sanitize: true, local: mode === "operator" };
  }
  const sale = path.match(new RegExp(`^/api/telegram-ad-sales/(${id})(?:/placements/(${id})/(operator-revision|publish|reconcile-published))?$`, "u"));
  if (mode === "operator" && sale) {
    if (url.search || sale[1] !== scope.saleId || (sale[2] && sale[2] !== scope.placementId)) return;
    if (method === "GET" && !sale[2]) return { saleRead: true };
    if (method === "GET" && sale[3] === "operator-revision") return { local: true };
    if (method === "POST" && ["publish", "reconcile-published"].includes(sale[3])) return { local: true, confirmation: true, revision: true };
    return;
  }
  const match = path.match(new RegExp(`^/api/telegram-channels/(${id})(.*)$`, "u"));
  if (!match) return;
  const [, channel, action] = match;
  if (mode === "operator" && channel !== scope.channelId) return;
  if (mode === "operator" && method === "GET" &&
    new RegExp(`^/${post}/operator-revision$`, "u").test(action) && !url.search) return { local: true };
  if (method === "GET" && channelRead.test(action) && action !== "/managed-posts/link-targets") {
    if (mode === "operator" && url.searchParams.has("channelId")) return;
    const local = mode === "operator" &&
      (["", "/post-group-summaries", "/reschedule-managed-posts-plan", "/recovery-managed-posts-snapshot"].includes(action) ||
        /^\/managed-posts(?:\/|$)/u.test(action));
    return { local, sanitize: action === "" };
  }
  if (url.search) return;
  if (mode === "operator") {
    if (method === "POST" && action === operatorRecovery) return { local: true, confirmation: true, batch: true };
    if ((method === "POST" && action === "/managed-posts") || (method === "PATCH" && channelWrite.PATCH.test(action))) {
      return { local: true, confirmation: true, revision: method === "PATCH" };
    }
    if (method === "POST" && publish.test(action)) return { local: true, confirmation: true, revision: true };
    return;
  }
  if (method === "POST" && /^\/managed-posts\/delete-batch(?:-stream)?$/u.test(action)) {
    return { confirmation: true, batch: true, single: true };
  }
  if (channelWrite[method]?.test(action)) return { confirmation: true };
}
