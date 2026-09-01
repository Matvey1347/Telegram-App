import { describe, expect, it } from "vitest";
import { resolveAdSalesSurface } from "./crm-routes";

describe("resolveAdSalesSurface", () => {
  it("keeps legacy sale links and sales surfaces intact", () => {
    expect(resolveAdSalesSurface("/ad-sales", new URLSearchParams("saleId=sale-1"))).toEqual({ kind: "legacy" });
    expect(resolveAdSalesSurface("/ad-sales/sales", new URLSearchParams())).toEqual({ kind: "legacy" });
    expect(resolveAdSalesSurface("/ad-sales/calendar", new URLSearchParams())).toEqual({ kind: "legacy" });
  });

  it("uses root and the clients alias for all contacts", () => {
    expect(resolveAdSalesSurface("/ad-sales", new URLSearchParams())).toEqual({ kind: "contacts", view: "ALL" });
    expect(resolveAdSalesSurface("/ad-sales/clients", new URLSearchParams())).toEqual({ kind: "contacts", view: "ALL" });
  });

  it("restores URL-driven views and deep conversation context", () => {
    expect(resolveAdSalesSurface("/ad-sales", new URLSearchParams("view=follow-up&followUp=READ_NO_REPLY"))).toEqual({ kind: "contacts", view: "FOLLOW_UP" });
    expect(resolveAdSalesSurface("/ad-sales/contacts/contact-1/conversations/conversation-2", new URLSearchParams())).toEqual({
      kind: "contact",
      contactId: "contact-1",
      conversationId: "conversation-2",
    });
  });
});
