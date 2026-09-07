export type AdSalesSurface =
  | { kind: "legacy" }
  | {
      kind: "contacts";
      contactId?: string;
      conversationId?: string;
    }
  | {
      kind: "inbox";
      conversationId: string | null;
      peerId: string | null;
    };

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
  if (pathname === "/ad-sales/inbox") {
    return {
      kind: "inbox",
      conversationId: searchParams?.get("conversationId")?.trim() || null,
      peerId: searchParams?.get("peerId")?.trim() || null,
    };
  }
  const contactConversation = pathname.match(
    /^\/ad-sales\/(?:contacts|clients)\/([^/]+)\/conversations\/([^/]+)$/,
  );
  if (contactConversation) {
    return {
      kind: "contacts",
      contactId: decodeURIComponent(contactConversation[1]),
      conversationId: decodeURIComponent(contactConversation[2]),
    };
  }
  return { kind: "contacts" };
}
