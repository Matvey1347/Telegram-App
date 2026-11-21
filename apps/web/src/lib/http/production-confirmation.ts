import { CanceledError } from "axios";
import { publicWebEnvironment } from "@/config/public-env";

export function confirmProductionAction(
  method: string,
  path: string,
  workspace: string | undefined,
  payload?: unknown,
  target?: { revision: string; title: string },
) {
  if (
    typeof window === "undefined" ||
    !publicWebEnvironment.isDevelopment ||
    publicWebEnvironment.databaseEnvironment !== "production" ||
    !["POST", "PATCH", "PUT", "DELETE"].includes(method) ||
    (!/^\/api\/telegram-channels\/[^/]+\/managed-posts(?:\/|$)/u.test(path) &&
      !/^\/api\/telegram-ad-sales\/[^/]+\/placements\/[^/]+\/(?:publish|reconcile-published)$/u.test(path))
  ) return;

  const postIds = /\/managed-posts\/(?:reschedule-all-stream|delete-batch(?:-stream)?)$/u.test(path)
    ? (payload as { postIds?: string[] } | undefined)?.postIds
    : undefined;
  if (!workspace) throw new CanceledError("Select a production workspace first.");
  const action = `${method} ${workspace} ${path}${postIds?.length ? ` ${postIds.join(",")}` : ""}${target ? ` @${target.revision}` : ""}`;
  if (!window.confirm(`PRODUCTION — LIVE ACTIONS\n\nWorkspace ${workspace}\n${method} ${path}${postIds?.length ? `\nPosts ${postIds.join(", ")}` : ""}${target ? `\n${target.title}\nRevision ${target.revision}` : ""}\n\nApply this action to production?`)) {
    throw new CanceledError("Production action cancelled.");
  }
  return action;
}

export async function productionActionHeaders(
  method: string,
  path: string,
  headers: Headers,
  payload: unknown,
  signal?: AbortSignal,
) {
  let target: { revision: string; title: string } | undefined;
  const isOperator = typeof window !== "undefined" && publicWebEnvironment.liveMode === "operator";
  if (isOperator && (method === "PATCH" || method === "POST")) {
    const post = path.match(/^(\/api\/telegram-channels\/[^/]+\/managed-posts\/[^/]+)(?:\/(?:publish(?:-stream)?|reconcile-published))?$/u);
    const placement = path.match(/^(\/api\/telegram-ad-sales\/[^/]+\/placements\/[^/]+)\/(?:publish|reconcile-published)$/u);
    const base = method === "PATCH" ? post?.[1] : placement?.[1] ?? (path.includes("/publish") || path.endsWith("/reconcile-published") ? post?.[1] : undefined);
    if (base) {
      const response = await fetch(`${base}/operator-revision`, {
        headers: {
          Authorization: headers.get("authorization") ?? "",
          "X-Workspace-Id": headers.get("x-workspace-id") ?? "",
        },
        cache: "no-store", signal,
      });
      if (!response.ok) throw new CanceledError("The selected production revision could not be verified. Reload the object before acting.");
      target = await response.json();
    }
  }
  const confirmation = confirmProductionAction(method, path, headers.get("x-workspace-id") ?? undefined, payload, target);
  if (!confirmation) return;
  headers.set("x-live-action-confirmation", confirmation);
  if (target) headers.set("x-operator-revision", target.revision);
}

export async function fetchApiStream(url: string, options: RequestInit, payload: unknown) {
  const headers = new Headers(options.headers);
  await productionActionHeaders(options.method ?? "POST", url, headers, payload, options.signal ?? undefined);
  return fetch(url, { ...options, headers });
}
