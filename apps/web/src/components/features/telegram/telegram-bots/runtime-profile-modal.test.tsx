import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RuntimeProfileModal } from "./runtime-profile-modal";

describe("RuntimeProfileModal", () => {
  it("shows the fixed Finance logo and offers name editing without image uploads", () => {
    render(<RuntimeProfileModal config={{ environment: "LOCAL", bot: {
      id: "bot-1", label: "Finance", applicationType: "FINANCE", runtimes: [],
    } as never }} saving={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByText("New Telegram bot name")).toBeInTheDocument();
    expect(screen.queryByText("Favicon")).not.toBeInTheDocument();
    expect(screen.queryByText("Favicon light")).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
