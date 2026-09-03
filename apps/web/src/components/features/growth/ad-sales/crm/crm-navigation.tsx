"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarRange,
  CircleDollarSign,
  MessagesSquare,
  Users,
} from "lucide-react";
import { crmText } from "./crm-copy";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import { crmPermissions } from "./crm-permissions";

const primary = [
  ["nav.inbox", "/ad-sales/inbox", MessagesSquare],
  ["nav.contacts", "/ad-sales", Users],
  ["nav.deals", "/ad-sales/sales", CircleDollarSign],
  ["nav.calendar", "/ad-sales/calendar", CalendarRange],
  ["nav.analytics", "/ad-sales/analytics", BarChart3],
] as const;

export function CrmNavigation({
  canViewInbox,
  canViewSales,
  inboxUnread = 0,
}: {
  canViewInbox?: boolean;
  canViewSales?: boolean;
  inboxUnread?: number;
}) {
  const pathname = usePathname();
  const me = useQuery({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
    enabled: canViewInbox === undefined || canViewSales === undefined,
  });
  const permissions = crmPermissions(me.data?.workspace.access);
  const showInbox = canViewInbox ?? permissions.canViewAll;
  const showSales = canViewSales ?? permissions.canViewSales;
  const contactsActive =
    pathname === "/ad-sales" ||
    pathname.startsWith("/ad-sales/contacts") ||
    pathname.startsWith("/ad-sales/clients");
  return (
    <nav
      aria-label="CRM navigation"
      className="mb-5 overflow-hidden rounded-[18px] border border-neutral-800 bg-[#111111]"
    >
      <div className="flex overflow-x-auto px-2">
        {primary
          .filter(([copyKey]) => copyKey !== "nav.inbox" || showInbox)
          .filter(
            ([copyKey]) =>
              !["nav.deals", "nav.calendar", "nav.analytics"].includes(
                copyKey,
              ) || showSales,
          )
          .map(([copyKey, href, Icon]) => {
            const active =
              copyKey === "nav.contacts"
                ? contactsActive
                : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={linkClass(active)}>
                <Icon size={16} />
                <span>{crmText(copyKey)}</span>
                {copyKey === "nav.inbox" && inboxUnread ? (
                  <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {inboxUnread}
                  </span>
                ) : null}
              </Link>
            );
          })}
      </div>
    </nav>
  );
}

function linkClass(active: boolean) {
  return `relative inline-flex h-14 shrink-0 items-center gap-2 px-4 text-sm font-medium transition ${
    active
      ? "text-white after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-blue-500"
      : "text-neutral-400 hover:text-white"
  }`;
}
