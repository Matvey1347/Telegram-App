"use client";

import { useLeadText } from "./leads/lead-copy";
import Link from "next/link";
import { CrmAiUsage } from "@/components/features/operations/ai/crm-ai-usage";
import { usePathname } from "next/navigation";
import {
  CalendarRange,
  CircleDollarSign,
  ChartNoAxesCombined,
  Users,
  Inbox,
  Radar,
} from "lucide-react";
import { CrmSaleReturnLink } from "./crm-sale-return-link";
import { crmText } from "./crm-copy";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import { leadAccess } from "@/lib/features/growth/lead-discovery-query";
import { crmPermissions } from "./crm-permissions";

const primary = [
  ["nav.contacts", "/ad-sales", Users],
  ["nav.deals", "/ad-sales/sales", CircleDollarSign],
  ["nav.calendar", "/ad-sales/calendar", CalendarRange],
  ["nav.analytics", "/ad-sales/analytics", ChartNoAxesCombined],
] as const;

export function CrmNavigation({
  canViewInbox,
  canViewSales,
  inboxUnread,
}: {
  canViewInbox?: boolean;
  canViewSales?: boolean;
  inboxUnread?: number;
}) {
  const t = useLeadText();
  const pathname = usePathname();
  const me = useQuery({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
    enabled: canViewSales === undefined || canViewInbox === undefined,
  });
  const permissions = crmPermissions(me.data?.workspace.access);
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
        {(canViewInbox ?? (permissions.canViewOwn || permissions.canViewAll)) ? <Link href="/ad-sales/inbox" className={linkClass(pathname === "/ad-sales/inbox")}><Inbox size={16} /><span>Inbox</span>{inboxUnread ? <span className="rounded-full bg-blue-500/20 px-1.5 text-xs text-blue-200">{inboxUnread}</span> : null}</Link> : null}
        {leadAccess(me.data?.workspace.access).view ? <Link href="/ad-sales/leads" className={linkClass(pathname.startsWith("/ad-sales/leads"))}><Radar size={16}/><span>{t("Lead Discovery")}</span></Link> : null}
        {primary
          .filter(
            ([copyKey]) =>
              !["nav.deals", "nav.calendar", "nav.analytics"].includes(copyKey) || showSales,
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
              </Link>
            );
          })}
      </div>
      <CrmSaleReturnLink />
      <CrmAiUsage />
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
