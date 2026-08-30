"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  BriefcaseBusiness,
  Bug,
  ChevronDown,
  ChevronRight,
  Clock3,
  Gauge,
  Landmark,
  Megaphone,
  MessageCircle,
  RadioTower,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
} from "lucide-react";

type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  featureId?: string;
  permissionId?: string;
};

type NavigationGroup = {
  key: "telegram" | "growth" | "operations";
  label: string;
  icon: LucideIcon;
  children: readonly NavigationItem[];
};

const primaryItems: readonly NavigationItem[] = [
  { label: "Overview", href: "/", icon: Gauge, featureId: "dashboard" },
  { label: "Finance", href: "/finance", icon: Landmark, featureId: "finance" },
];

const groups: readonly NavigationGroup[] = [
  {
    key: "telegram",
    label: "Telegram",
    icon: MessageCircle,
    children: [
      {
        label: "Channels",
        href: "/telegram-channels",
        icon: RadioTower,
        featureId: "channels",
      },
      {
        label: "Posts",
        href: "/telegram-posts",
        icon: Send,
        featureId: "posts",
      },
      { label: "Bots", href: "/telegram-bots", icon: Bot, featureId: "bots" },
    ],
  },
  {
    key: "growth",
    label: "Growth",
    icon: Megaphone,
    children: [
      {
        label: "Ad sales",
        href: "/ad-sales",
        icon: BriefcaseBusiness,
        featureId: "adSales.sales",
      },
      {
        label: "Ad campaigns",
        href: "/ad-campaigns",
        icon: Megaphone,
        featureId: "advertising",
      },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    icon: Settings,
    children: [
      {
        label: "Scheduled tasks",
        href: "/scheduled-tasks",
        icon: Clock3,
        featureId: "operations",
      },
      {
        label: "Trash",
        href: "/trash",
        icon: Trash2,
        permissionId: "operations.restoreTrash",
        featureId: "operations",
      },
      {
        label: "System logs",
        href: "/system-logs",
        icon: Bug,
        permissionId: "operations.viewSystemLogs",
        featureId: "operations",
      },
      {
        label: "Workspace settings",
        href: "/settings",
        icon: Settings,
        featureId: "workspace",
      },
      {
        label: "Roles & access",
        href: "/roles",
        icon: ShieldCheck,
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
      <span className="truncate">{item.label}</span>
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
  const featureAllowed = (item: NavigationItem) =>
    !effectiveFeatureIds ||
    !item.featureId ||
    effectiveFeatureIds.includes(item.featureId);
  const permissionAllowed = (item: NavigationItem) =>
    !item.permissionId ||
    (effectivePermissionKeys
      ? effectivePermissionKeys.includes(item.permissionId)
      : canViewAdmin);
  return (
    <nav
      aria-label="Primary navigation"
      className="app-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
    >
      {primaryItems.filter(featureAllowed).map((item) => (
        <ItemLink key={item.href} item={item} pathname={pathname} />
      ))}

      <div className="space-y-2 pt-3">
        {groups.map((group) => {
          const visibleChildren = group.children.filter(
            (item) =>
              featureAllowed(item) &&
              permissionAllowed(item) &&
              (!item.adminOnly || canViewAdmin),
          );
          const active = visibleChildren.some((item) =>
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
                  {group.label}
                </span>
                {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
              {open ? (
                <div id={panelId} className="mt-1 space-y-1 pl-2">
                  {visibleChildren.map((item) => (
                    <ItemLink key={item.href} item={item} pathname={pathname} />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </nav>
  );
}
