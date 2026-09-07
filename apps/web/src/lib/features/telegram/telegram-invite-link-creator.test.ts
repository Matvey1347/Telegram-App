import { describe, expect, it } from "vitest";
import { inviteLinkCreatorFallback } from "./telegram-invite-link-creator";

describe("inviteLinkCreatorFallback", () => {
  it("ignores blank Telegram creator fields and keeps the admin placeholder", () => {
    expect(
      inviteLinkCreatorFallback({
        name: "Imported link",
        creatorMember: { name: "" },
        creatorFirstName: " ",
        creatorUsername: "",
      }),
    ).toBe("Admin");
  });

  it("uses the resolved admin name when one is available", () => {
    expect(
      inviteLinkCreatorFallback({ creatorUsername: "channel_admin" }),
    ).toBe("channel_admin");
  });
});
