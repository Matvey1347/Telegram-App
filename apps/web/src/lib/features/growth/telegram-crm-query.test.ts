import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type {
  CrmContactListItem,
  CrmContactsListResult,
} from "@telegram-system/shared";
import {
  applyCrmReplyMessage,
  telegramCrmKeys,
} from "./telegram-crm-query";

const params = { page: 1, pageSize: 12 };
const contact = {
  id: "contact-1",
  replySummary: {
    status: "NONE",
    inboundMessageCount: 0,
    outboundMessageCount: 0,
    countsComplete: false,
    unreadCount: 0,
    muted: true,
  },
} as CrmContactListItem;

function setup() {
  const client = new QueryClient();
  client.setQueryData<CrmContactsListResult>(
    telegramCrmKeys.contactList(params),
    {
      items: [contact],
      pagination: {
        page: 1,
        pageSize: 12,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
  );
  return client;
}

function current(client: QueryClient) {
  return client.getQueryData<CrmContactsListResult>(
    telegramCrmKeys.contactList(params),
  )!.items[0].replySummary;
}

describe("CRM live reply summary cache", () => {
  it("turns a first live inbound message into an urgent unmuted reply state", () => {
    const client = setup();

    applyCrmReplyMessage(client, "contact-1", "INBOUND");

    expect(current(client)).toMatchObject({
      status: "FIRST_INBOUND_UNREAD",
      inboundMessageCount: 1,
      outboundMessageCount: 0,
      unreadCount: 1,
      muted: false,
    });
  });

  it("clears an unanswered state immediately after an outgoing reply", () => {
    const client = setup();
    applyCrmReplyMessage(client, "contact-1", "INBOUND");

    applyCrmReplyMessage(client, "contact-1", "OUTBOUND");

    expect(current(client)).toMatchObject({
      status: "NONE",
      inboundMessageCount: 1,
      outboundMessageCount: 1,
      muted: false,
    });
  });
});
