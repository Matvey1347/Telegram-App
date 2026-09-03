type WorkspaceAccessSnapshot = {
  featureIds: readonly string[];
};

const featureLandingPaths: readonly [featureId: string, path: string][] = [
  ["dashboard", "/"],
  ["channels", "/telegram-channels"],
  ["posts", "/telegram-posts"],
  ["bots", "/telegram-bots"],
  ["adSales.crm", "/ad-sales/clients"],
  ["adSales.sales", "/ad-sales/sales"],
  ["advertising", "/ad-campaigns"],
  ["finance", "/finance"],
  ["operations", "/scheduled-tasks"],
  ["workspace", "/settings"],
  ["members", "/workspace-members"],
];

const featureRoutePrefixes: readonly [
  prefix: string,
  featureIds: readonly string[],
][] = [
  ["/telegram-posts", ["posts"]],
  ["/telegram-channels", ["channels"]],
  ["/telegram-channel-networks", ["channels"]],
  ["/telegram/channels", ["channels"]],
  ["/telegram-bots", ["bots"]],
  ["/system-bot", ["systemBots"]],
  ["/ad-sales", ["adSales.crm", "adSales.sales"]],
  ["/ad-campaigns", ["advertising"]],
  ["/promos", ["advertising"]],
  ["/advertising-channels", ["advertising"]],
  ["/ad-sources", ["advertising"]],
  ["/finance", ["finance"]],
  ["/currencies", ["finance"]],
  ["/accounts", ["finance"]],
  ["/transactions", ["finance"]],
  ["/transfers", ["finance"]],
  ["/investments", ["finance"]],
  ["/categories", ["finance"]],
  ["/scheduled-tasks", ["operations"]],
  ["/trash", ["operations"]],
  ["/system-logs", ["operations"]],
  ["/settings", ["workspace"]],
  ["/workspace-members", ["members"]],
  ["/roles", ["members"]],
];

function matchesRoute(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function workspaceLandingPath(access?: WorkspaceAccessSnapshot) {
  if (!access) return "/";
  return (
    featureLandingPaths.find(([featureId]) =>
      access.featureIds.includes(featureId),
    )?.[1] ?? "/account"
  );
}

export function workspacePathIsAllowed(
  pathname: string,
  access?: WorkspaceAccessSnapshot,
) {
  if (!access) return true;
  if (pathname === "/") return access.featureIds.includes("dashboard");

  const route = featureRoutePrefixes.find(([prefix]) =>
    matchesRoute(pathname, prefix),
  );
  return (
    !route ||
    route[1].some((featureId) => access.featureIds.includes(featureId))
  );
}

export function resolveWorkspacePath(
  requestedPath: string,
  access?: WorkspaceAccessSnapshot,
) {
  const pathname = requestedPath.split(/[?#]/, 1)[0] || "/";
  return workspacePathIsAllowed(pathname, access)
    ? requestedPath
    : workspaceLandingPath(access);
}
