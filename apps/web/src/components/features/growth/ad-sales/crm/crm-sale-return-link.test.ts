import { describe, expect, it } from "vitest";
import { safeInboxReturnPath } from "./crm-sale-return-link";

describe("safe Inbox return destination", () => {
  it("restores exact conversation, workspace and details while dropping unrelated parameters", () => {
    expect(safeInboxReturnPath("/ad-sales/inbox?conversationId=thread-a&workspaceId=workspace-b&details=1&token=private")).toBe("/ad-sales/inbox?conversationId=thread-a&workspaceId=workspace-b&details=1");
  });
  it.each([null, "https://outside.test", "//outside.test", "/ad-sales/inbox?conversationId=", "/ad-sales/inbox/other?conversationId=a", "/ad-sales/inbox?conversationId=a\\b"])("rejects unsafe or incomplete destination %s", (value) => {
    expect(safeInboxReturnPath(value)).toBeNull();
  });
});
