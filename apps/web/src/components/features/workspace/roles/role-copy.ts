import type {
  FeatureDefinition,
  WorkspaceRoleContract,
} from "@telegram-system/shared";

const FEATURE_COPY: Record<string, { label: string; description: string }> = {
  dashboard: {
    label: "Overview",
    description: "Workspace dashboard and shared metrics",
  },
  channels: {
    label: "Channels",
    description: "Telegram channels and networks",
  },
  posts: { label: "Posts", description: "Drafting, scheduling and publishing" },
  bots: { label: "Bots", description: "Telegram bot integrations" },
  systemBots: {
    label: "System bots",
    description: "System bot configuration and runtime",
  },
  "adSales.sales": {
    label: "Ad Sales",
    description: "Sales, placements and payments",
  },
  "adSales.crm": {
    label: "CRM",
    description: "Advertisers, tasks and automation",
  },
  advertising: {
    label: "Advertising",
    description: "Campaigns, promos and sources",
  },
  finance: {
    label: "Finance",
    description: "Accounts, transactions and currencies",
  },
  members: {
    label: "Members & roles",
    description: "Workspace membership and access",
  },
  workspace: {
    label: "Workspace",
    description: "Workspace settings and deletion",
  },
  operations: {
    label: "Operations",
    description: "Tasks, trash and system logs",
  },
};

const CAPABILITY_COPY: Record<string, string> = {
  view: "View",
  create: "Create",
  editOwn: "Edit own",
  editAny: "Edit all",
  deleteOwn: "Delete own",
  deleteAny: "Delete all",
  manage: "Manage",
  publish: "Publish",
  manageCredentials: "Manage credentials",
  manageRuntime: "Manage runtime",
  registerPayment: "Register payments",
  viewOwn: "View own",
  viewAny: "View all",
  sendManualMessages: "Send manual messages",
  executeTransactions: "Execute transactions",
  manageCurrencies: "Manage currencies",
  assignRoles: "Assign roles",
  delete: "Delete workspace",
  restoreTrash: "Restore trash",
  viewSystemLogs: "View logs",
  notifications: "Notifications",
};

export function featureCopy(feature: FeatureDefinition) {
  return (
    FEATURE_COPY[feature.id] ?? {
      label: feature.id,
      description: "Workspace feature access",
    }
  );
}

export function capabilityLabel(capability: string) {
  return CAPABILITY_COPY[capability] ?? capability.replace(/([A-Z])/g, " $1");
}

export function configuredKeys(
  role: Pick<WorkspaceRoleContract, "mode" | "permissionKeys">,
) {
  return new Set(role.permissionKeys);
}

export function permissionIsEnabled(
  mode: WorkspaceRoleContract["mode"],
  keys: Set<string>,
  id: string,
) {
  return mode === "ALLOWLIST" ? keys.has(id) : !keys.has(id);
}

export function summarizeRole(
  features: readonly FeatureDefinition[],
  mode: WorkspaceRoleContract["mode"],
  keys: Set<string>,
) {
  const enabled = features.flatMap((feature) =>
    feature.permissions.filter((item) =>
      permissionIsEnabled(mode, keys, item.id),
    ),
  );
  if (!enabled.length) return "No access to workspace features.";
  const areas = features
    .filter((feature) =>
      feature.permissions.some((item) => enabled.includes(item)),
    )
    .map((feature) => featureCopy(feature).label);
  const ownOnly =
    enabled.some((item) => item.capability === "editOwn") &&
    !enabled.some((item) => item.capability === "editAny");
  const hidden = features
    .filter(
      (feature) => !feature.permissions.some((item) => enabled.includes(item)),
    )
    .map((feature) => featureCopy(feature).label);
  return (
    `${ownOnly ? "Can work with own data in" : "Has access to"} ${areas.join(", ")}.` +
    (hidden.length
      ? ` No access to ${hidden.join(", ")}.`
      : " Full feature coverage.")
  );
}
