import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { CrmInboxConversationItem, CrmSalesWorkflow } from "@telegram-system/shared";
import { patchInboxContactSales, reconcileCrmSalesWorkflow } from "./crm-sales-workflow-cache";
import { patchInboxMessage, type CrmInboxData } from "./crm-inbox-cache";
import { telegramCrmKeys } from "./telegram-crm-query";

const row = { id: "thread-a", workspaceId: "workspace-a", state: "ACTIVE", contact: { id: "client-a", displayName: "Client", stage: "LEAD", nextContactAt: null, manualSalesStatus: null },
  lastMessageAt: "2026-10-20T10:00:00Z", lastInboundAt: "2026-10-20T10:00:00Z", lastOutboundAt: null, unreadCount: 3, attentionStatus: "NEEDS_REPLY" } as CrmInboxConversationItem;
function setup() {
  const client = new QueryClient();
  for (const filter of ["ALL", "NEEDS_REPLY", "FOLLOW_UP"] as const) client.setQueryData<CrmInboxData>(telegramCrmKeys.inboxConversationsList({ filter }), { pages: [{ items: filter === "FOLLOW_UP" ? [] : [row, { ...row, id: "thread-b" }], nextCursor: "tail", hasMore: true }], pageParams: [null] });
  return client;
}
const list = (client: QueryClient, filter: "ALL" | "NEEDS_REPLY" | "FOLLOW_UP") => client.getQueryData<CrmInboxData>(telegramCrmKeys.inboxConversationsList({ filter }))!;

describe("CRM sales workflow reconciliation", () => {
  it("patches every linked account conversation and removes terminal decisions from reply filters without hiding unread", () => {
    const client = setup();
    patchInboxContactSales(client, "client-a", { manualSalesStatus: "CLOSED" });
    expect(list(client, "ALL").pages[0].items.map((item) => item.attentionStatus)).toEqual(["CLOSED", "CLOSED"]);
    expect(list(client, "ALL").pages[0].items[0].unreadCount).toBe(3);
    expect(list(client, "NEEDS_REPLY").pages[0].items).toEqual([]);
    expect(list(client, "ALL").pages[0].nextCursor).toBe("tail");
  });
  it("keeps a manual decision sticky when new client messages arrive, and resumes derivation on explicit reset", () => {
    const client = setup(); patchInboxContactSales(client, "client-a", { manualSalesStatus: "DO_NOT_CONTACT" });
    patchInboxMessage(client, { id: "new", conversationId: row.id, direction: "INBOUND", sentAt: "2026-10-22T10:00:00Z", text: "New message" } as never);
    expect(list(client, "ALL").pages[0].items[0].attentionStatus).toBe("DO_NOT_CONTACT");
    patchInboxContactSales(client, "client-a", { manualSalesStatus: null });
    expect(list(client, "NEEDS_REPLY").pages[0].items).toHaveLength(2);
  });
  it("moves current due reminders into and out of the follow-up view from authoritative results", () => {
    const client = setup();
    reconcileCrmSalesWorkflow(client, { conversationId: row.id, contactId: "client-a", manualStatus: null, attentionStatus: "FOLLOW_UP_DUE", nextContactAt: "2001-01-01T10:00:00Z", nextFollowUp: null } as CrmSalesWorkflow);
    expect(list(client, "FOLLOW_UP").pages[0].items).toHaveLength(2);
    reconcileCrmSalesWorkflow(client, { conversationId: row.id, contactId: "client-a", manualStatus: null, attentionStatus: "NEEDS_REPLY", nextContactAt: null, nextFollowUp: null } as CrmSalesWorkflow);
    expect(list(client, "FOLLOW_UP").pages[0].items).toEqual([]);
  });
  it.each(["INTERESTED", "HUMAN_REVIEW"] as const)("keeps due %s clients in the follow-up filter while preserving their manual label", (manualSalesStatus) => {
    const client = setup();
    patchInboxContactSales(client, "client-a", { manualSalesStatus, nextContactAt: "2001-01-01T10:00:00Z" });
    expect(list(client, "FOLLOW_UP").pages[0].items).toHaveLength(2);
    expect(list(client, "FOLLOW_UP").pages[0].items[0].attentionStatus).toBe(manualSalesStatus);
  });
  it("does not reactivate archived clients and never touches unrelated cached clients", () => {
    const client = setup();
    expect(patchInboxContactSales(client, "another-client", { manualSalesStatus: "CLOSED" })).toBe(false);
    patchInboxContactSales(client, "client-a", { archivedAt: "2026-10-22T10:00:00Z" });
    expect(list(client, "ALL").pages[0].items[0].attentionStatus).toBeNull();
    expect(list(client, "NEEDS_REPLY").pages[0].items).toEqual([]);
  });
});
