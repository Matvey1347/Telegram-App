import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TelegramInviteLinkCreatorAvatar } from "./telegram-invite-link-creator-avatar";

describe("TelegramInviteLinkCreatorAvatar", () => {
  it("shows the same MTP placeholder when the creator has no avatar", () => {
    render(<TelegramInviteLinkCreatorAvatar label="Admin" />);
    expect(screen.getByText("MTP")).toBeInTheDocument();
  });

  it("falls back to the MTP placeholder when the saved photo fails", () => {
    render(
      <TelegramInviteLinkCreatorAvatar
        label="Admin"
        photoUrl="https://invalid.test/avatar.jpg"
      />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Admin" }));
    expect(screen.getByText("MTP")).toBeInTheDocument();
  });

  it("renders an emoji creator name as the Telegram avatar fallback", () => {
    render(<TelegramInviteLinkCreatorAvatar label="😇" />);
    expect(screen.getByText("😇")).toBeInTheDocument();
    expect(screen.getByText("😇")).toHaveClass("!bg-violet-400");
    expect(screen.queryByText("MTP")).not.toBeInTheDocument();
  });

  it("falls back to the Telegram emoji avatar when a guessed photo is unavailable", () => {
    render(
      <TelegramInviteLinkCreatorAvatar
        label="😇"
        photoUrl="https://t.me/i/userpic/320/owner.jpg"
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "😇" }));

    expect(screen.getByText("😇")).toBeInTheDocument();
    expect(screen.queryByText("MTP")).not.toBeInTheDocument();
  });
});
