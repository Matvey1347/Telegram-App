import { describe, expect, it } from "vitest";
import { trackingLinkTitle } from "./cross-promotion-auto-title";

describe("trackingLinkTitle", () => {
  it("replaces an automatically selected title when the link changes", () => {
    expect(trackingLinkTitle("Imported link", "Imported link", "New link")).toBe("New link");
  });
  it("preserves a title edited by the user", () => {
    expect(trackingLinkTitle("My title", null, "New link")).toBeNull();
  });
});
