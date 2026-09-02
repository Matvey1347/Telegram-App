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

  it("shows only the system-bot setup instructions until access is confirmed", () => {
    render(<TelegramInlineKeyboardEditor open onOpenChange={vi.fn()} buttonRows={[[{ text: "", url: "", style: "default" }]]} onChange={vi.fn()} canPublishInlineButtons={false} onCheckPublishingAccess={vi.fn().mockResolvedValue(false)} />);
    expect(screen.getByText(/add our system bot as a channel administrator/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check system bot access/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Text")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add row/i })).not.toBeInTheDocument();
  });
});
