import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramPublicationScheduleInput } from "@telegram-system/shared";
import { PublicationScheduleEditor } from "./publication-schedule-editor";

vi.mock("@/components/icons/icon-picker", () => ({ IconPicker: () => null }));

describe("PublicationScheduleEditor", () => {
  it("sorts a changed slot by time and offers optional only for regular posts", () => {
    function Editor() {
      const [draft, setDraft] = useState<TelegramPublicationScheduleInput>({ name: "Plan", slots: [
        { id: "first", title: "First", kind: "CONTENT", time: "12:10" },
        { id: "third", title: "Third", kind: "CONTENT", time: "17:10" },
        { id: "ad", title: "Ad", kind: "AD", time: "18:10" },
      ] });
      return <PublicationScheduleEditor draft={draft} icon={null} onIconChange={() => {}} onChange={setDraft} />;
    }
    render(<Editor />);
    fireEvent.change(screen.getByLabelText("Slot 3 time"), { target: { value: "13:10" } });
    fireEvent.blur(screen.getByLabelText("Slot 3 time"));
    expect(screen.getAllByRole("textbox").map((input) => (input as HTMLInputElement).value)).toEqual(["Plan", "First", "12:10", "Ad", "13:10", "Third", "17:10"]);
    expect(screen.queryByLabelText("Slot 2 requirement")).toBeNull();
    const select = screen.getByLabelText("Slot 1 requirement");
    fireEvent.click(select);
    fireEvent.click(screen.getByRole("option", { name: "Optional" }));
    expect(select).toHaveTextContent("Optional");
    fireEvent.click(screen.getByLabelText("Slot 1 type"));
    fireEvent.click(screen.getByRole("option", { name: /Advertising/ }));
    expect(screen.queryByLabelText("Slot 1 requirement")).toBeNull();
  });
});
