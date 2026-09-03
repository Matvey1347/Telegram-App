import type { CrmMessageListItem } from "@telegram-system/shared";
import { describe, expect, it } from "vitest";
import { crmMessageOriginLabel } from "./crm-message-presentation";

const message = (patch: Partial<CrmMessageListItem>): CrmMessageListItem => ({
  id: "message-1",
  workspaceId: "workspace-1",
  conversationId: "conversation-1",
  telegramMessageId: "1",
  telegramMessageIdNumeric: 1,
  clientIdempotencyKey: null,
  mtprotoAccountId: "account-1",
  direction: "INBOUND",
  origin: "TELEGRAM_SYNC",
  sentByMemberId: null,
  text: "Hello",
  contentMetadata: null,
  sentAt: "2026-08-31T12:00:00.000Z",
  editedAt: null,
  readState: "READ",
  deliveryState: "SENT",
  createdAt: "2026-08-31T12:00:00.000Z",
  account: {
    id: "account-1",
    label: "Sales",
    username: "sales",
    photoUrl: null,
  },
  sentByMember: null,
  ...patch,
});

describe("crmMessageOriginLabel", () => {
  it("does not invent a Member for historical Telegram messages", () => {
    expect(crmMessageOriginLabel(message({ origin: "TELEGRAM_SYNC" }))).toBe(
      "Telegram history",
    );
  });

  it("labels system and attributed manual messages explicitly", () => {
    expect(crmMessageOriginLabel(message({ origin: "SYSTEM" }))).toBe("System");
    expect(
      crmMessageOriginLabel(
        message({
          origin: "MANUAL",
          sentByMember: {
            id: "member-1",
            name: "Alice",
            email: null,
            avatarPresentation: null,
          },
        }),
      ),
    ).toBe("Manual · Member: Alice");
  });
});
