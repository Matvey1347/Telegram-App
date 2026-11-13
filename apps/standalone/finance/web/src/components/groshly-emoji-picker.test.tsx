import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroshlyEmojiPicker } from "./groshly-emoji-picker";
import { emojiIcons } from "@finance-web/lib/emoji-icons";

describe("GroshlyEmojiPicker", () => {
  it("searches the complete catalogue and selects the matching emoji", () => {
    const onPick = vi.fn();
    render(<GroshlyEmojiPicker value="" onPick={onPick} t={(_, en) => en} />);
    expect(emojiIcons.length).toBeGreaterThan(2000);
    fireEvent.change(screen.getByRole("textbox", { name: "Search emojis" }), { target: { value: "rocket" } });
    fireEvent.click(screen.getByRole("button", { name: /rocket 🚀/i }));
    expect(onPick).toHaveBeenCalledWith("🚀");
  });

  it("limits rendering and lets users browse more", () => {
    render(<GroshlyEmojiPicker value="" onPick={vi.fn()} t={(_, en) => en} />);
    const more = screen.getByRole("button", { name: "Show more" });
    expect(screen.getAllByRole("button").length).toBeLessThan(150);
    fireEvent.click(more);
    expect(screen.getAllByRole("button").length).toBeGreaterThan(150);
    fireEvent.change(screen.getByRole("textbox", { name: "Search emojis" }), { target: { value: "unfindable-no-such-emoji" } });
    expect(screen.getByText("No emoji found")).toBeInTheDocument();
  });
});
