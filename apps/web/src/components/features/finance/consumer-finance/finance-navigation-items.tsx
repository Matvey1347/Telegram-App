"use client";

import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  CalendarClock,
  CalendarRange,
  ChevronDown,
  CreditCard,
  Gauge,
  HandCoins,
  Landmark,
  LayoutGrid,
  List,
  Menu,
  PiggyBank,
  Settings2,
  Settings,
  Tags,
  TrendingUp,
  UserRound,
  WalletCards,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { FinanceCoreCopy } from "./i18n/core";
import type { ConsumerFinanceScreen } from "./consumer-finance-navigation";
import styles from "./finance-navigation-items.module.css";
import groupStyles from "./finance-navigation-groups.module.css";
import specialStyles from "./finance-navigation-special-motion.module.css";

export type FinanceNavigationItem = {
  id: ConsumerFinanceScreen;
  key: keyof FinanceCoreCopy;
  Icon: LucideIcon;
};

export type FinanceNavigationGroup = {
  id: "summary" | "money" | "planning" | "service";
  key: keyof FinanceCoreCopy;
  Icon: LucideIcon;
  items: readonly FinanceNavigationItem[];
};

export const FINANCE_NAVIGATION_GROUPS: ReadonlyArray<FinanceNavigationGroup> =
  [
    {
      id: "summary",
      key: "navigationSummary",
      Icon: Gauge,
      items: [
        { id: "home", key: "overview", Icon: Landmark },
        { id: "analytics", key: "analytics", Icon: BarChart3 },
      ],
    },
    {
      id: "money",
      key: "navigationMoney",
      Icon: Wallet,
      items: [
        { id: "transactions", key: "transactions", Icon: List },
        { id: "transfers", key: "transfers", Icon: ArrowLeftRight },
        { id: "accounts", key: "accounts", Icon: WalletCards },
        { id: "categories", key: "categories", Icon: Tags },
      ],
    },
    {
      id: "planning",
      key: "navigationPlanning",
      Icon: CalendarRange,
      items: [
        { id: "budget", key: "budget", Icon: LayoutGrid },
        {
          id: "regular-payments",
          key: "regularPayments",
          Icon: CalendarClock,
        },
        { id: "savings", key: "savings", Icon: PiggyBank },
        { id: "debts", key: "debts", Icon: HandCoins },
        { id: "investments", key: "investments", Icon: TrendingUp },
      ],
    },
    {
      id: "service",
      key: "navigationService",
      Icon: Settings2,
      items: [{ id: "reminders", key: "reminders", Icon: Bell }],
    },
  ];

export const FINANCE_PRIMARY_NAVIGATION = [
  FINANCE_NAVIGATION_GROUPS[0].items[0],
  FINANCE_NAVIGATION_GROUPS[1].items[0],
  FINANCE_NAVIGATION_GROUPS[0].items[1],
] as const;

export const FINANCE_MORE_NAVIGATION_GROUPS = FINANCE_NAVIGATION_GROUPS.map(
  (group) => ({
    ...group,
    items: group.items.filter(
      (item) => !FINANCE_PRIMARY_NAVIGATION.some(({ id }) => id === item.id),
    ),
  }),
).filter((group) => group.items.length);

export function isFinanceNavigationActive(
  screen: ConsumerFinanceScreen,
  id: ConsumerFinanceScreen,
) {
  return (
    screen === id ||
    (screen === "account" && id === "accounts") ||
    (screen === "investment" && id === "investments")
  );
}

export function FinanceNavigationButton({
  item,
  label,
  active,
  mobile = false,
  onClick,
}: {
  item: FinanceNavigationItem;
  label: string;
  active: boolean;
  mobile?: boolean;
  onClick: () => void;
}) {
  const { Icon } = item;
  const [pressSequence, setPressSequence] = useState(0);
  const activate = () => {
    setPressSequence((current) => current + 1);
    onClick();
  };
  return (
    <button
      type="button"
      data-finance-nav-id={item.id}
      data-finance-nav-active={active ? "true" : "false"}
      aria-current={active ? "page" : undefined}
      onClick={activate}
      className={`${styles.item} ${specialStyles.scope} ${active ? styles.active : ""} group outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
        mobile
          ? "flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px]"
          : "flex min-h-11 w-full items-center gap-2 rounded-xl border border-transparent px-2.5 text-sm"
      } ${active ? "border-sky-800/60 bg-sky-500/15 text-sky-200 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.04)]" : mobile ? "text-neutral-400" : "border-neutral-800/70 bg-neutral-900/45 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-800/80 hover:text-white"}`}
    >
      <span
        key={pressSequence}
        data-finance-icon-sequence={pressSequence}
        className={`${styles.iconTile} inline-flex shrink-0 items-center justify-center rounded-lg border border-neutral-700/60 bg-neutral-800/60 ${mobile ? "h-7 w-7 border-transparent bg-transparent" : "h-8 w-8"}`}
      >
        <Icon
          className={`${styles.icon} ${specialStyles.icon}`}
          size={mobile ? 18 : 17}
          aria-hidden="true"
        />
      </span>
      <span className={mobile ? "max-w-full truncate" : "truncate"}>
        {label}
      </span>
    </button>
  );
}

export function FinanceNavigationGroupHeader({
  group,
  label,
  collapsed,
  controls,
  onToggle,
}: {
  group: FinanceNavigationGroup;
  label: string;
  collapsed: boolean;
  controls: string;
  onToggle: () => void;
}) {
  const { Icon } = group;
  return (
    <button
      type="button"
      data-finance-navigation-group={group.id}
      aria-expanded={!collapsed}
      aria-controls={controls}
      onClick={onToggle}
      className={`${groupStyles.groupHeader} mb-1 flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500 outline-none hover:bg-neutral-900/70 hover:text-neutral-300 focus-visible:ring-2 focus-visible:ring-sky-300`}
    >
      <span className={groupStyles.groupIcon} aria-hidden="true">
        <Icon size={13} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronDown
        size={13}
        aria-hidden="true"
        className={`${groupStyles.groupChevron} ${collapsed ? groupStyles.groupChevronCollapsed : ""}`}
      />
    </button>
  );
}

export function FinanceScreenIcon({
  screen,
}: {
  screen: ConsumerFinanceScreen;
}) {
  const item = FINANCE_NAVIGATION_GROUPS.flatMap((group) => group.items).find(
    ({ id }) => isFinanceNavigationActive(screen, id),
  );
  const Icon =
    item?.Icon ??
    ({ profile: UserRound, billing: CreditCard, settings: Settings } as const)[
      screen as "profile" | "billing" | "settings"
    ] ??
    Menu;
  return (
    <span
      data-finance-screen-icon={screen}
      data-finance-nav-id={item?.id ?? screen}
      className={`${styles.pageIcon} ${specialStyles.pageScope} ${groupStyles.pageIconMotion} inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-800/70 bg-sky-500/10 text-sky-200 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.05)]`}
    >
      <Icon
        className={`${styles.icon} ${specialStyles.icon}`}
        size={19}
        aria-hidden="true"
      />
    </span>
  );
}
