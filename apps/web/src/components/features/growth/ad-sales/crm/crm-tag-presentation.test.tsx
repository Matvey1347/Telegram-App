import { describe, expect, it } from "vitest";
import type { CrmTagSummary } from "@telegram-system/shared";
import { crmTagDisplayName } from "./crm-tag-presentation";

const tag = (name: string): CrmTagSummary => ({
  id: "tag-1",
  name,
  color: "#22c55e",
  systemKey: "TELEGRAM_FOLDER:account-1:9",
  isSystem: true,
  assignmentMode: "AUTOMATIC",
});

describe("crmTagDisplayName", () => {
  it("keeps the literal emoji returned by the Telegram folder", () => {
    expect(crmTagDisplayName(tag("🗓 Meetings"))).toBe("🗓 Meetings");
  });

  it("keeps an ordinary emoji unchanged when no Premium asset exists", () => {
    expect(crmTagDisplayName(tag("📂 Archive"))).toBe("📂 Archive");
  });
});
