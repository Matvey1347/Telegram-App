import { describe, expect, it } from "vitest";
import { resolveAdSalesSurface } from "./crm-routes";

describe("resolveAdSalesSurface", () => {
  it("keeps legacy sale links and sales surfaces intact", () => {
    expect(
      resolveAdSalesSurface("/ad-sales", new URLSearchParams("saleId=sale-1")),
    ).toEqual({ kind: "legacy" });
    expect(
      resolveAdSalesSurface("/ad-sales/sales", new URLSearchParams()),
    ).toEqual({ kind: "legacy" });
    expect(
      resolveAdSalesSurface("/ad-sales/calendar", new URLSearchParams()),
    ).toEqual({ kind: "legacy" });
  });

  it("uses root and the clients alias for all contacts", () => {
    expect(resolveAdSalesSurface("/ad-sales", new URLSearchParams())).toEqual({
      kind: "contacts",
    });
    expect(
      resolveAdSalesSurface("/ad-sales/clients", new URLSearchParams()),
    ).toEqual({ kind: "contacts" });
  });

  it("collapses old filters and detail links back to the clients surface", () => {
    expect(
      resolveAdSalesSurface(
        "/ad-sales",
        new URLSearchParams("view=follow-up&followUp=READ_NO_REPLY"),
      ),
    ).toEqual({ kind: "contacts" });
    expect(
      resolveAdSalesSurface(
        "/ad-sales/contacts/contact-1/conversations/conversation-2",
        new URLSearchParams(),
      ),
    ).toEqual({ kind: "contacts" });
  });

  it("preserves an exact unassigned inbox thread deep link", () => {
    expect(
      resolveAdSalesSurface(
        "/ad-sales/inbox",
        new URLSearchParams("conversationId=conversation-7&peerId=peer-3"),
      ),
    ).toEqual({
      kind: "inbox",
      conversationId: "conversation-7",
      peerId: "peer-3",
    });
  });
});
