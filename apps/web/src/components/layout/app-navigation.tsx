"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Bug,
  ChevronDown,
  ChevronRight,
  Megaphone,
  MessageCircle,
  Settings,
  Trash2,
} from "lucide-react";
import { workspaceFeatureIcons } from "@/lib/features/workspace/workspace-feature-icons";
import { useOptionalI18n } from "@/providers/i18n-provider";
import navigationEn from "@/i18n/locales/en/navigation";
import type { TranslationKey } from "@/i18n/catalog";

type NavigationItem = {
  label: TranslationKey;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  featureId?: string;
  featureIds?: readonly string[];
  permissionId?: string;
};

type NavigationGroup = {
  key: "telegram" | "growth" | "operations";
  label: TranslationKey;
  icon: LucideIcon;
  children: readonly NavigationItem[];
};

const primaryItems: readonly NavigationItem[] = [
  {
    label: "navigation.overview",
    href: "/",
    icon: workspaceFeatureIcons.dashboard,
    featureId: "dashboard",
  },
  {
    label: "navigation.finance",
    href: "/finance",
    icon: workspaceFeatureIcons.finance,
    featureId: "finance",
  },
];

const groups: readonly NavigationGroup[] = [
  {
    key: "telegram",
    label: "navigation.telegram",
    icon: MessageCircle,
    children: [
      {
        label: "navigation.channels",
        href: "/telegram-channels",
        icon: workspaceFeatureIcons.channels,
        featureId: "channels",
      },
      {
        label: "navigation.posts",
        href: "/telegram-posts",
        icon: workspaceFeatureIcons.posts,
        featureId: "posts",
      },
      {
        label: "navigation.bots",
        href: "/telegram-bots",
        icon: workspaceFeatureIcons.bots,
        featureId: "bots",
      },
    ],
  },
  {
    key: "growth",
    label: "navigation.growth",
    icon: Megaphone,
    children: [
      {
        label: "navigation.crm",
        href: "/ad-sales",
        icon: workspaceFeatureIcons["adSales.sales"],
        featureIds: ["adSales.crm", "adSales.sales"],
      },
      {
        label: "navigation.adCampaigns",
        href: "/ad-campaigns",
        icon: workspaceFeatureIcons.advertising,
        featureId: "advertising",
      },
    ],
  },
  {
    key: "operations",
    label: "navigation.operations",
    icon: Settings,
    children: [
      {
        label: "navigation.scheduledTasks",
        href: "/scheduled-tasks",
        icon: workspaceFeatureIcons.operations,
        featureId: "operations",
      },
      {
        label: "navigation.trash",
        href: "/trash",
        icon: Trash2,
        permissionId: "operations.restoreTrash",
        featureId: "operations",
      },
      {
        label: "navigation.systemLogs",
        href: "/system-logs",
        icon: Bug,
        permissionId: "operations.viewSystemLogs",
        featureId: "operations",
      },
      {
        label: "navigation.workspaceSettings",
        href: "/settings",
        icon: workspaceFeatureIcons.workspace,
        featureId: "workspace",
      },
      {
        label: "navigation.roles",
        href: "/roles",
        icon: workspaceFeatureIcons.members,
        permissionId: "members.assignRoles",
        featureId: "members",
      },
    ],
  },
];

function routeIsActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/settings") {
    return (
      pathname === "/settings" || pathname.startsWith("/workspace-members")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ItemLink({
  item,
  pathname,
}: {
  item: NavigationItem;
  pathname: string;
}) {
  const i18n = useOptionalI18n();
  const t = (key: TranslationKey) =>
    i18n?.t(key) ?? navigationEn[key as keyof typeof navigationEn] ?? key;
  const active = routeIsActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-10 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
        active
          ? "bg-neutral-800 text-white"
          : "text-neutral-300 hover:bg-neutral-900 hover:text-white"
      }`}
    >
      <Icon size={17} aria-hidden="true" />
      <span className="truncate">{t(item.label)}</span>
    </Link>
  );
}

export function AppNavigation({
  pathname,
  openGroups,
  onToggleGroup,
  canViewAdmin,
  effectiveFeatureIds,
  effectivePermissionKeys,
}: {
  pathname: string;
  openGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
  canViewAdmin: boolean;
  effectiveFeatureIds?: readonly string[];
  effectivePermissionKeys?: readonly string[];
}) {
  const i18n = useOptionalI18n();
  const t = (key: TranslationKey) =>
    i18n?.t(key) ?? navigationEn[key as keyof typeof navigationEn] ?? key;
  const featureAllowed = (item: NavigationItem) =>
    !effectiveFeatureIds ||
    ((!item.featureId || effectiveFeatureIds.includes(item.featureId)) &&
      (!item.featureIds ||
        item.featureIds.some((featureId) =>
          effectiveFeatureIds.includes(featureId),
        )));
  const permissionAllowed = (item: NavigationItem) =>
    !item.permissionId ||
    (effectivePermissionKeys
      ? effectivePermissionKeys.includes(item.permissionId)
      : canViewAdmin);
  const visiblePrimaryItems = primaryItems.filter(featureAllowed);
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      children: group.children.filter(
        (item) =>
          featureAllowed(item) &&
          permissionAllowed(item) &&
          (!item.adminOnly || canViewAdmin),
      ),
    }))
    .filter((group) => group.children.length > 0);
  const visibleItemCount =
    visiblePrimaryItems.length +
    visibleGroups.reduce((total, group) => total + group.children.length, 0);
  const onlyVisibleItem =
    visibleItemCount === 1
      ? (visiblePrimaryItems[0] ?? visibleGroups[0]?.children[0])
      : null;

  return (
    <nav
      aria-label={t("navigation.primary")}
      className="app-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
    >
      {onlyVisibleItem ? (
        <ItemLink item={onlyVisibleItem} pathname={pathname} />
      ) : (
        visiblePrimaryItems.map((item) => (
          <ItemLink key={item.href} item={item} pathname={pathname} />
        ))
      )}

      {!onlyVisibleItem && visibleGroups.length ? (
        <div className="space-y-2 pt-3">
          {visibleGroups.map((group) => {
            const active = group.children.some((item) =>
              routeIsActive(pathname, item.href),
            );
            const open = openGroups[group.key] ?? active;
            const GroupIcon = group.icon;
            const panelId = `sidebar-group-${group.key}`;
            return (
              <section
                key={group.key}
                className="border-t border-neutral-900 pt-2"
              >
                <button
                  type="button"
                  onClick={() => onToggleGroup(group.key)}
                  aria-expanded={open}
                  aria-controls={panelId}
                  className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium uppercase tracking-wide transition hover:bg-neutral-900 hover:text-white ${
                    active ? "text-neutral-200" : "text-neutral-500"
                  }`}
                >
                  <GroupIcon size={15} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {t(group.label)}
                  </span>
                  {open ? (
                    <ChevronDown size={15} />
                  ) : (
                    <ChevronRight size={15} />
                  )}
                </button>
                {open ? (
                  <div id={panelId} className="mt-1 space-y-1 pl-2">
                    {group.children.map((item) => (
                      <ItemLink
                        key={item.href}
                        item={item}
                        pathname={pathname}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}
