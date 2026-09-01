import { describe, expect, it } from "vitest";
import { crmText } from "./crm-copy";

describe("CRM automation copy", () => {
  it("uses the explicit fail-closed customer confirmation", () => {
    expect(crmText("automation.confirm")).toBe(
      "Allow future automated Telegram messages for this customer.",
    );
    expect(crmText("automation.off")).toBe("Automated messages · OFF");
  });
});
