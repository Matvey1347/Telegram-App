import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
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

  it("keeps the clicked slot time when its channel timezone differs from the browser", async () => {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    occurrences.mockResolvedValue([
      {
        slotId: "morning",
        scheduledAt: `${date}T07:10:00.000Z`,
        title: "Morning",
        kind: "CONTENT",
        time: "10:10",
        timezone: "Europe/Kyiv",
        state: "AVAILABLE",
      },
    ]);

    function ControlledSlotPicker() {
      const [schedule, setSchedule] = useState<string | null>(null);
      const [slotId, setSlotId] = useState<string | null>(null);
      return (
        <PublicationSlotOccurrenceSelect
          channelId="channel-1"
          value={slotId && schedule ? `${slotId}:${schedule}` : null}
          scheduledAt={schedule}
          onChange={({ slotId: nextSlotId, scheduledAt }) => {
            setSlotId(nextSlotId);
            setSchedule(scheduledAt);
          }}
        />
      );
    }

    render(
      <QueryClientProvider client={new QueryClient()}>
        <TestI18nProvider>
          <ControlledSlotPicker />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    const slot = await screen.findByRole("button", {
      name: /10:10.*Regular publication/i,
    });
    fireEvent.click(slot);

    expect(screen.getByDisplayValue("10:10")).toBeInTheDocument();
  });

  it("shows and saves a manual time in the supplied channel timezone", () => {
    const onChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TestI18nProvider>
          <PublicationSlotOccurrenceSelect
            channelId="channel-1"
            value={null}
            scheduledAt="2026-10-07T16:00:00.000Z"
            timezone="Europe/Kyiv"
            onChange={onChange}
          />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByDisplayValue("19:00")).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("19:00"), {
      target: { value: "20:00" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      slotId: null,
      scheduledAt: "2026-10-07T17:00:00.000Z",
    });
  });
});
