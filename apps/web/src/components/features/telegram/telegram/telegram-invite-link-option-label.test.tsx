import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TelegramInviteLinkOptionLabel } from "./telegram-invite-link-option-label";

describe("TelegramInviteLinkOptionLabel", () => {
  it("shows purpose icons and hides their text on narrow screens", () => {
    render(
      <TelegramInviteLinkOptionLabel
        link={{
          name: "Campaign link",
          isDefaultForChannel: true,
          isDefaultForMutualPromotion: true,
          isDefaultForFolders: true,
          isDefaultForBot: true,
          isDefaultForBroadcast: true,
          isDefaultForAudienceTransfer: true,
        }}
      />,
    );
    for (const label of [
      "Default",
      "VP",
      "Folders",
      "Bot",
      "Newsletter",
      "Transfer",
    ]) {
      const badge = screen.getByLabelText(label);
      expect(badge.querySelector("svg")).toBeInTheDocument();
      expect(badge.querySelector("span")).toHaveClass("hidden", "sm:inline");
    }
  });
});
