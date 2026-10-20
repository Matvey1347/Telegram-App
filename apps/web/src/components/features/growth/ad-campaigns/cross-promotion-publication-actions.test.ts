import { describe, expect, it } from "vitest";
import { canUpdatePublicationInTelegram } from "./cross-promotion-publication-actions";

describe("canUpdatePublicationInTelegram", () => {
  it("keeps retry available for a published post after a partial update", () => {
    expect(
      canUpdatePublicationInTelegram({ changed: false, published: true }),
    ).toBe(true);
  });

  it("hides a no-op update for an unchanged scheduled post", () => {
    expect(
      canUpdatePublicationInTelegram({ changed: false, published: false }),
    ).toBe(false);
  });
});
