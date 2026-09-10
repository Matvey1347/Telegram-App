"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Megaphone, MessageCircle, Settings } from "lucide-react";
import type { TranslationKey } from "@/i18n/catalog";
import navigationEn from "@/i18n/locales/en/navigation";
import { workspaceFeatureIcons } from "@/lib/features/workspace/workspace-feature-icons";
import { useOptionalI18n } from "@/providers/i18n-provider";
import styles from "./app-pwa-navigation.module.css";

type PwaNavigationItem = {
  key: string;
  label: TranslationKey;
  href: string;
  Icon: LucideIcon;
  active: (pathname: string) => boolean;
};

const hasAny = (enabled: readonly string[] | undefined, ids: readonly string[]) =>
  !enabled || ids.some((id) => enabled.includes(id));

export function buildPwaNavigation(
  featureIds: readonly string[] | undefined,
): PwaNavigationItem[] {
  const items: PwaNavigationItem[] = [];
  if (hasAny(featureIds, ["dashboard"])) {
    items.push({
      key: "overview",
      label: "navigation.overview",
      href: "/",
      Icon: workspaceFeatureIcons.dashboard,
      active: (pathname) => pathname === "/",
    });
  }
  if (hasAny(featureIds, ["finance"])) {
    items.push({
      key: "finance",
      label: "navigation.finance",
      href: "/finance",
      Icon: workspaceFeatureIcons.finance,
      active: (pathname) =>
        pathname === "/finance" || pathname.startsWith("/finance/"),
    });
  }

  const telegramDestinations = [
    { feature: "channels", href: "/telegram-channels" },
    { feature: "posts", href: "/telegram-posts" },
    { feature: "bots", href: "/telegram-bots" },
  ] as const;
  const telegram = telegramDestinations.find(
    ({ feature }) => !featureIds || featureIds.includes(feature),
  );
  if (telegram) {
    items.push({
      key: "telegram",
      label: "navigation.telegram",
      href: telegram.href,
      Icon: MessageCircle,
      active: (pathname) => pathname.startsWith("/telegram"),
    });
  }

  const canUseCrm = hasAny(featureIds, ["adSales.crm", "adSales.sales"]);
  const canUseAds = hasAny(featureIds, ["advertising"]);
  if (canUseCrm || canUseAds) {
    items.push({
      key: "growth",
      label: "navigation.growth",
      href: canUseCrm ? "/ad-sales" : "/ad-campaigns",
      Icon: Megaphone,
      active: (pathname) =>
        pathname.startsWith("/ad-sales") ||
        pathname.startsWith("/ad-campaigns"),
    });
  }

  if (hasAny(featureIds, ["workspace", "operations", "members"])) {
    items.push({
      key: "workspace",
      label: "navigation.workspaceSettings",
      href: "/settings",
      Icon: Settings,
      active: (pathname) =>
        pathname.startsWith("/settings") ||
        pathname.startsWith("/workspace-members") ||
        pathname.startsWith("/roles") ||
        pathname.startsWith("/trash") ||
        pathname.startsWith("/scheduled-tasks"),
    });
  }
  return items;
}

export function AppPwaNavigation({
  pathname,
  effectiveFeatureIds,
}: {
  pathname: string;
  effectiveFeatureIds?: readonly string[];
}) {
  const i18n = useOptionalI18n();
  const t = (key: TranslationKey) =>
    i18n?.t(key) ?? navigationEn[key as keyof typeof navigationEn] ?? key;
  const items = buildPwaNavigation(effectiveFeatureIds);

  return (
    <nav className={styles.navigation} aria-label={t("navigation.primary")}>
      {items.map((item) => {
        const active = item.active(pathname);
        const Icon = item.Icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`${styles.item} ${active ? styles.active : ""}`}
          >
            <Icon size={20} aria-hidden="true" />
            <span className={styles.label}>{t(item.label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
