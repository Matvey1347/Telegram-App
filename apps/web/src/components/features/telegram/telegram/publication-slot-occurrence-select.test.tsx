import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { TestI18nProvider } from "@/test/render-with-i18n";
import { PublicationSlotOccurrenceSelect } from "./publication-slot-occurrence-select";

const occurrences = vi.fn();
vi.mock("@/lib/api", () => ({
  telegramPublicationSchedulesApi: {
    occurrences: (...args: unknown[]) => occurrences(...args),
  },
}));

describe("PublicationSlotOccurrenceSelect", () => {
  it("shows typed channel slots and prevents reuse of an occupied occurrence", async () => {
    const today = new Date();
    today.setHours(23, 40, 0, 0);
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    occurrences.mockResolvedValue([
      {
        slotId: "content",
        scheduledAt: today.toISOString(),
        title: "Morning",
        kind: "CONTENT",
        time: "23:40",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        state: "AVAILABLE",
      },
      {
        slotId: "ad",
        scheduledAt: new Date(today.getTime() + 60_000).toISOString(),
        title: "Ad",
        kind: "AD",
        time: "23:41",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        state: "OCCUPIED",
        postTitle: "Booked post",
      },
      {
        slotId: "later",
        scheduledAt: new Date(today.getTime() + 120_000).toISOString(),
        title: "Later",
        kind: "CONTENT",
        time: "23:42",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        state: "AVAILABLE",
      },
      {
        slotId: "past",
        scheduledAt: new Date(today.getTime() + 180_000).toISOString(),
        title: "Past",
        kind: "CONTENT",
        time: "23:43",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        state: "PAST",
      },
    ]);
    const onChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TestI18nProvider>
          <PublicationSlotOccurrenceSelect
            channelId="channel-1"
            value={null}
            scheduledAt={today.toISOString()}
            onChange={onChange}
          />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    const availableSlot = await screen.findByRole("button", {
      name: /23:40.*Regular publication/i,
    });
    expect(availableSlot).toBeEnabled();
    // A manually entered time can match a slot without reserving it.
    expect(availableSlot).toHaveAttribute("aria-pressed", "true");
    expect(availableSlot.className).toContain("ring-blue-500");
    const otherSlot = screen.getByRole("button", {
      name: /23:42.*Regular publication/i,
    });
    expect(otherSlot).toHaveAttribute("aria-pressed", "false");
    expect(otherSlot.className).toContain("border-neutral-600");
    expect(availableSlot).toHaveTextContent("23:40·📝");
    const occupiedSlot = screen.getByRole("button", {
      name: /23:41.*Advertising.*Booked post/i,
    });
    expect(occupiedSlot).toBeDisabled();
    expect(occupiedSlot.className).toContain("border-amber-900");
    const pastSlot = screen.getByRole("button", {
      name: /23:43.*Regular publication.*Past slot/i,
    });
    expect(pastSlot.className).toContain("line-through");
    fireEvent.click(availableSlot);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ slotId: "content" }),
    );
    expect(screen.getByDisplayValue(day)).toBeInTheDocument();
    expect(screen.getByDisplayValue("23:40")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("23:40"), {
      target: { value: "23:45" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      slotId: null,
      scheduledAt: new Date(`${day}T23:45:00`).toISOString(),
    });
  });
});
