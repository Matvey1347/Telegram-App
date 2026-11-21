import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroshlyEmojiPicker } from "./groshly-emoji-picker";
import { emojiIcons } from "@finance-web/lib/emoji-icons";

vi.mock("@finance-web/lib/emoji-search", async (importOriginal) => ({
  ...await importOriginal<typeof import("@finance-web/lib/emoji-search")>(),
  loadEmojiSearch: vi.fn().mockResolvedValue([]),
}));

describe("GroshlyEmojiPicker", () => {
  it("searches the complete catalogue and selects the matching emoji", () => {
    const onPick = vi.fn();
    render(<GroshlyEmojiPicker value="" onPick={onPick} t={(_, en) => en} />);
    expect(emojiIcons.length).toBeGreaterThan(2000);
    fireEvent.change(screen.getByRole("textbox", { name: "Search emojis" }), { target: { value: "rocket" } });
    fireEvent.click(screen.getByRole("button", { name: /rocket 🚀/i }));
    expect(onPick).toHaveBeenCalledWith("🚀");
  });

  it("renders the selected category and handles an empty search", async () => {
    render(<GroshlyEmojiPicker value="" onPick={vi.fn()} t={(_, en) => en} />);
    const people = screen.getByRole("region", { name: "People" });
    expect(within(people).getAllByRole("button")).toHaveLength(
      emojiIcons.filter((item) => item.category === "people").length,
    );
    expect(screen.queryByRole("region", { name: "Travel" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Travel" }));
    expect(screen.getByRole("button", { name: "Travel" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Travel" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search emojis" }), { target: { value: "unfindable-no-such-emoji" } });
    expect(await screen.findByText("No emoji found")).toBeInTheDocument();
  });
});
