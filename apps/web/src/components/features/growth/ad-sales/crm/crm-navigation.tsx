"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { crmText } from "./crm-copy";
import type { CrmListView } from "./crm-routes";

const primary = [
  ["nav.inbox", "/ad-sales/inbox"],
  ["nav.contacts", "/ad-sales"],
  ["nav.deals", "/ad-sales/sales"],
  ["nav.calendar", "/ad-sales/calendar"],
  ["nav.analytics", "/ad-sales/analytics"],
] as const;

const secondary = [
  ["contacts.leads", "/ad-sales?view=leads", "LEADS"],
  ["contacts.qualified", "/ad-sales?view=qualified", "QUALIFIED"],
  ["contacts.followUp", "/ad-sales?view=follow-up&followUp=TODAY", "FOLLOW_UP"],
  ["contacts.customers", "/ad-sales?view=customers", "CUSTOMERS"],
  ["contacts.all", "/ad-sales", "ALL"],
  ["contacts.lostArchived", "/ad-sales?view=lost", "LOST_ARCHIVED"],
] as const;

function linkClass(active: boolean, secondary = false) {
  return `inline-flex min-h-9 items-center rounded-lg border px-3 text-sm transition ${
    active
      ? "border-teal-500/60 bg-teal-500/15 text-teal-100"
      : "border-neutral-800 bg-neutral-950/40 text-neutral-400 hover:border-neutral-700 hover:text-white"
  } ${secondary ? "min-h-8 px-2.5 text-xs" : ""}`;
}

export function CrmNavigation({ view, canViewInbox, canViewSales, inboxUnread = 0 }: { view?: CrmListView; canViewInbox: boolean; canViewSales: boolean; inboxUnread?: number }) {
  const pathname = usePathname();
  const contactsActive =
    pathname === "/ad-sales" ||
    pathname.startsWith("/ad-sales/contacts") ||
    pathname.startsWith("/ad-sales/clients") ||
    secondary.some(([, href]) => href !== "/ad-sales" && pathname === href.split("?")[0]);
  return (
    <nav aria-label="CRM navigation" className="mb-5 space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {primary.filter(([copyKey]) => copyKey !== "nav.inbox" || canViewInbox).filter(([copyKey]) => !["nav.deals", "nav.calendar", "nav.analytics"].includes(copyKey) || canViewSales).map(([copyKey, href]) => {
          const active =
            copyKey === "nav.contacts"
              ? contactsActive
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} className={linkClass(active)}>
              {crmText(copyKey)}{copyKey === "nav.inbox" && inboxUnread ? ` (${inboxUnread})` : ""}
            </Link>
          );
        })}
      </div>
      {contactsActive ? (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Contact views">
          {secondary.map(([copyKey, href, itemView]) => (
            <Link
              key={href}
              href={href}
              className={linkClass(view === itemView, true)}
            >
              {crmText(copyKey)}
            </Link>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
