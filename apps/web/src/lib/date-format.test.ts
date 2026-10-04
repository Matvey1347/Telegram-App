import { describe, expect, it } from "vitest";
import { formatDateTime } from "./date-format";

describe("formatDateTime", () => {
  it("formats a stored instant in the requested workspace timezone", () => {
    const instant = "2026-01-15T15:10:00.000Z";

    expect(formatDateTime(instant, undefined, "Europe/Kyiv")).toBe(
      "15/01/2026, 17:10",
    );
    expect(formatDateTime(instant, undefined, "America/New_York")).toBe(
      "15/01/2026, 10:10",
    );
  });
});
