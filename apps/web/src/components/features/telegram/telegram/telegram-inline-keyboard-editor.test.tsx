import { fireEvent, screen } from "@testing-library/react";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { TelegramPostButtonRows } from "@telegram-system/shared";
import { TelegramInlineKeyboardEditor } from "./telegram-inline-keyboard-editor";

describe("TelegramInlineKeyboardEditor", () => {
  it("keeps a new button draft quiet and does not prefill its link", () => {
    render(<TelegramInlineKeyboardEditor open onOpenChange={vi.fn()} buttonRows={[[{ text: "", url: "", style: "default" }]]} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Link")).toHaveValue("");
    expect(screen.queryByText("Enter button text")).not.toBeInTheDocument();
  });

  it("shows a link validation error as soon as a button has a label", () => {
    function Harness() {
      const [rows, setRows] = useState<TelegramPostButtonRows>([[{ text: "", url: "", style: "default" }]]);
      return <TelegramInlineKeyboardEditor open onOpenChange={vi.fn()} buttonRows={rows} onChange={setRows} />;
    }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Open" } });
    expect(screen.getByText("Enter a valid link")).toBeInTheDocument();
  });

  it("accepts the reusable invite-link token in the standard editor", () => {
    render(<TelegramInlineKeyboardEditor open onOpenChange={vi.fn()} buttonRows={[[{ text: "Join", url: "{{invite_link}}", style: "default" }]]} onChange={vi.fn()} />);
    expect(screen.queryByText("Enter a valid link")).not.toBeInTheDocument();
  });

  it("shows only the system-bot setup instructions until access is confirmed", () => {
    render(<TelegramInlineKeyboardEditor open onOpenChange={vi.fn()} buttonRows={[[{ text: "", url: "", style: "default" }]]} onChange={vi.fn()} canPublishInlineButtons={false} onCheckPublishingAccess={vi.fn().mockResolvedValue(false)} />);
    expect(screen.getByText(/add our system bot as a channel administrator/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check system bot access/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Text")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add row/i })).not.toBeInTheDocument();
  });

  it("stores and visibly confirms a Premium emoji as the native button icon", () => {
    function Harness() {
      const [rows, setRows] = useState<TelegramPostButtonRows>([[{ text: "Subscribe", url: "https://example.com", style: "primary" }]]);
      return <TelegramInlineKeyboardEditor open onOpenChange={vi.fn()} buttonRows={rows} onChange={setRows} customEmojiPacks={[{
        id: "pack-1", shortName: "team", title: "Team", telegramLink: "https://t.me/addemoji/team",
        emojis: [{ id: "emoji-1", documentId: "5330237710655306682", alt: "horn", kind: "STATIC", mimeType: "image/webp", isFree: true, needsRepainting: false, position: 0, assetUrl: "https://cdn.test/horn.webp", renderAssetUrl: null }],
      }]} />;
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Emoji" }));
    fireEvent.click(screen.getByRole("button", { name: "Premium" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert horn" }));

    expect(screen.getByLabelText("Premium")).toBeInTheDocument();
    expect(screen.getByAltText("horn")).toBeInTheDocument();
  });
});
