"use client";

import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Bot,
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
import type { FinanceCoreCopy } from "@consumer-finance/web/components/i18n/core";
import type { ConsumerFinanceScreen } from "@consumer-finance/web/components/app/consumer-finance-navigation";
import styles from "@consumer-finance/web/components/app/finance-navigation-items.module.css";
import groupStyles from "@consumer-finance/web/components/app/finance-navigation-groups.module.css";
import specialStyles from "@consumer-finance/web/components/app/finance-navigation-special-motion.module.css";

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
      className={`${mobile ? `${styles.item} ${specialStyles.scope}` : ""} ${active ? styles.active : ""} group outline-none focus-visible:ring-2 focus-visible:ring-[#98c876] ${
        mobile
          ? "flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[11px]"
          : "flex min-h-11 w-full items-center gap-2 rounded-2xl border border-transparent px-2.5 text-sm"
      } ${active ? "border-[#cfe5bc] bg-[#eaf4e7] text-[#1b5039]" : mobile ? "text-[#82958b]" : "border-transparent text-[#638276] hover:border-[#dce8db] hover:bg-[#edf3eb] hover:text-[#18382d]"}`}
    >
      <span
        key={pressSequence}
        data-finance-icon-sequence={pressSequence}
        className={`${mobile ? styles.iconTile : ""} inline-flex shrink-0 items-center justify-center rounded-xl border border-[#dce8db] bg-[#edf3eb] ${mobile ? "h-7 w-7 border-transparent bg-transparent" : "h-8 w-8"}`}
      >
        <Icon
          className={mobile ? `${styles.icon} ${specialStyles.icon}` : undefined}
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
      className={`${groupStyles.groupHeader} mb-1 flex min-h-8 w-full items-center gap-2 rounded-xl px-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-[#82958b] outline-none hover:bg-[#edf3eb] hover:text-[#315944] focus-visible:ring-2 focus-visible:ring-[#98c876]`}
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
    (screen === "assistant" ? Bot : undefined) ??
    Menu;
  return (
    <span
      data-finance-screen-icon={screen}
      data-finance-nav-id={item?.id ?? screen}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#cfe5bc] bg-[#eaf4e7] text-[#315e49]"
    >
      <Icon
        size={19}
        aria-hidden="true"
      />
    </span>
  );
}
