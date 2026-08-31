import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimezoneSelect } from "./timezone-select";

describe("TimezoneSelect", () => {
  it("shows the country flag, current UTC offset and searchable zones", () => {
    render(<TimezoneSelect value="Europe/Warsaw" onChange={vi.fn()} />);

    expect(screen.getByText("🇵🇱")).toBeInTheDocument();
    expect(screen.getByText(/^UTC[+−]\d{2}:\d{2}$/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Europe\/Warsaw/u }));
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "Tokyo" },
    });
    expect(screen.getByRole("button", { name: /Asia\/Tokyo/u })).toBeVisible();
  });
});
