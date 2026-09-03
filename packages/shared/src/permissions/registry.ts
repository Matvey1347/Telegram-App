import type {
  FeatureDefinition,
  PermissionCapability,
  PermissionDefinition,
  PermissionSensitivity,
} from "./types";
import type { I18nNamespace } from "../i18n/contracts";

type FeatureInput = {
  id: string;
  capabilities?: readonly PermissionCapability[];
  sensitive?: Readonly<Record<string, PermissionSensitivity>>;
  extra?: readonly { capability: string; sensitivity: PermissionSensitivity }[];
  navigation?: readonly string[];
  search?: readonly string[];
  dashboard?: readonly string[];
  i18nNamespaces?: readonly I18nNamespace[];
};

const STANDARD_CAPABILITIES = [
  "view",
  "create",
  "editOwn",
  "editAny",
  "deleteOwn",
  "deleteAny",
  "manage",
] as const satisfies readonly PermissionCapability[];

function permission(
  featureId: string,
  capability: string,
  sensitivity: PermissionSensitivity = "standard",
): PermissionDefinition {
  return {
    id: `${featureId}.${capability}`,
    featureId,
    capability,
    labelKey: `permissions.${featureId}.${capability}.label`,
    descriptionKey: `permissions.${featureId}.${capability}.description`,
    sensitivity,
  };
}

function feature(input: FeatureInput): FeatureDefinition {
  const capabilities = input.capabilities ?? STANDARD_CAPABILITIES;
  return {
    id: input.id,
    labelKey: `features.${input.id}.label`,
    descriptionKey: `features.${input.id}.description`,
    permissions: [
      ...capabilities.map((capability) =>
        permission(input.id, capability, input.sensitive?.[capability]),
      ),
      ...(input.extra ?? []).map((item) =>
        permission(input.id, item.capability, item.sensitivity),
      ),
    ],
    i18nNamespaces: input.i18nNamespaces ?? ["common", "navigation"],
    surfaces: {
      navigation: input.navigation ?? [],
      search: input.search ?? [],
      dashboard: input.dashboard ?? [],
    },
  };
}

export const WORKSPACE_FEATURE_REGISTRY = [
  feature({
    id: "dashboard",
    capabilities: ["view"],
    navigation: ["overview"],
    dashboard: ["workspaceOverview"],
  }),
  feature({
    id: "channels",
    navigation: ["telegramChannels", "telegramNetworks"],
    search: ["telegramChannels", "telegramNetworks"],
    dashboard: ["channelMetrics"],
  }),
  feature({
    id: "posts",
    i18nNamespaces: [
      "common",
      "navigation",
      "telegram/posts/common",
      "telegram/posts/editor",
      "telegram/posts/groups",
      "telegram/posts/calendar",
      "telegram/posts/import",
    ],
    navigation: ["telegramPosts"],
    search: ["telegramPosts"],
    dashboard: ["postSchedule"],
    extra: [
      { capability: "schedule", sensitivity: "standard" },
      { capability: "publish", sensitivity: "sensitive" },
    ],
  }),
  feature({
    id: "bots",
    navigation: ["telegramBots"],
    search: ["telegramBots"],
    extra: [
      { capability: "manageCredentials", sensitivity: "critical" },
      { capability: "manageRuntime", sensitivity: "critical" },
    ],
  }),
  feature({
    id: "systemBots",
    capabilities: ["view", "manage"],
    navigation: ["systemBots"],
    extra: [{ capability: "manageRuntime", sensitivity: "critical" }],
  }),
  feature({
    id: "adSales.sales",
    i18nNamespaces: ["common", "navigation", "ad-sales/common"],
    navigation: ["adSales"],
    search: ["adSales"],
    dashboard: ["adSalesMetrics"],
    extra: [{ capability: "registerPayment", sensitivity: "critical" }],
  }),
  feature({
    id: "adSales.crm",
    i18nNamespaces: ["common", "navigation", "ad-sales/common"],
    navigation: ["adSalesCrm"],
    search: ["advertisers"],
    dashboard: ["crmMetrics"],
    extra: [
      { capability: "viewOwn", sensitivity: "standard" },
      { capability: "viewAny", sensitivity: "sensitive" },
      { capability: "sendManualMessages", sensitivity: "sensitive" },
    ],
  }),
  feature({
    id: "advertising",
    navigation: ["adCampaigns"],
    search: ["adCampaigns", "promos", "adSources"],
    dashboard: ["advertisingMetrics"],
  }),
  feature({
    id: "finance",
    navigation: ["finance", "currencies"],
    search: ["accounts", "transactions", "transfers"],
    dashboard: ["financeMetrics"],
    sensitive: { deleteAny: "critical", manage: "critical" },
    extra: [
      { capability: "executeTransactions", sensitivity: "critical" },
      { capability: "manageCurrencies", sensitivity: "sensitive" },
    ],
  }),
  feature({
    id: "members",
    capabilities: ["view", "manage"],
    navigation: ["workspaceMembers"],
    search: ["workspaceMembers"],
    sensitive: { manage: "critical" },
    extra: [{ capability: "assignRoles", sensitivity: "critical" }],
  }),
  feature({
    id: "workspace",
    capabilities: ["view", "manage"],
    navigation: ["workspaceSettings"],
    sensitive: { manage: "critical" },
    extra: [{ capability: "delete", sensitivity: "critical" }],
  }),
  feature({
    id: "operations",
    capabilities: ["view", "manage"],
    navigation: ["scheduledTasks", "trash", "systemLogs"],
    search: ["scheduledTasks"],
    extra: [
      { capability: "notifications", sensitivity: "standard" },
      { capability: "restoreTrash", sensitivity: "sensitive" },
      { capability: "viewSystemLogs", sensitivity: "sensitive" },
    ],
  }),
] as const satisfies readonly FeatureDefinition[];

export const WORKSPACE_PERMISSION_REGISTRY = WORKSPACE_FEATURE_REGISTRY.flatMap(
  (item) => item.permissions,
);

export const WORKSPACE_PERMISSION_KEYS = new Set(
  WORKSPACE_PERMISSION_REGISTRY.map((item) => item.id),
);

export function workspaceFeature(featureId: string) {
  return WORKSPACE_FEATURE_REGISTRY.find((item) => item.id === featureId);
}

export function workspacePermission(permissionId: string) {
  return WORKSPACE_PERMISSION_REGISTRY.find((item) => item.id === permissionId);
}
