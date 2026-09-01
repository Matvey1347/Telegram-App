export type CrmListView =
  | "ALL"
  | "LEADS"
  | "QUALIFIED"
  | "FOLLOW_UP"
  | "CUSTOMERS"
  | "LOST_ARCHIVED";

export type AdSalesSurface =
  | { kind: "legacy" }
  | { kind: "contacts"; view: CrmListView }
  | { kind: "inbox" }
  | { kind: "contact"; contactId: string; conversationId: string | null };

export function resolveAdSalesSurface(
  pathname: string,
  searchParams?: Pick<URLSearchParams, "has" | "get">,
): AdSalesSurface {
  if (searchParams?.has("saleId")) return { kind: "legacy" };
  if (
    pathname === "/ad-sales/sales" ||
    pathname === "/ad-sales/calendar" ||
    pathname === "/ad-sales/analytics"
  ) {
    return { kind: "legacy" };
  }
  const contactMatch = pathname.match(
    /^\/ad-sales\/(?:contacts|clients)\/([^/]+)(?:\/conversations\/([^/]+))?\/?$/,
  );
  if (contactMatch) {
    return {
      kind: "contact",
      contactId: decodeURIComponent(contactMatch[1]!),
      conversationId: contactMatch[2]
        ? decodeURIComponent(contactMatch[2])
        : null,
    };
  }
  if (pathname === "/ad-sales/inbox") return { kind: "inbox" };
  const queryView = searchParams?.get("view")?.toLowerCase();
  if (queryView === "leads") return { kind: "contacts", view: "LEADS" };
  if (queryView === "qualified") return { kind: "contacts", view: "QUALIFIED" };
  if (queryView === "follow-up") return { kind: "contacts", view: "FOLLOW_UP" };
  if (queryView === "customers") return { kind: "contacts", view: "CUSTOMERS" };
  if (queryView === "lost" || queryView === "archived") return { kind: "contacts", view: "LOST_ARCHIVED" };
  if (pathname === "/ad-sales/leads") return { kind: "contacts", view: "LEADS" };
  if (pathname === "/ad-sales/qualified") {
    return { kind: "contacts", view: "QUALIFIED" };
  }
  if (pathname === "/ad-sales/follow-up") {
    return { kind: "contacts", view: "FOLLOW_UP" };
  }
  if (pathname === "/ad-sales/customers") {
    return { kind: "contacts", view: "CUSTOMERS" };
  }
  if (pathname === "/ad-sales/lost" || pathname === "/ad-sales/archived") {
    return { kind: "contacts", view: "LOST_ARCHIVED" };
  }
  return { kind: "contacts", view: "ALL" };
}
