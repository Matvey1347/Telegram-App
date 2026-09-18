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
    ]);
    const onChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TestI18nProvider>
          <PublicationSlotOccurrenceSelect
            channelId="channel-1"
            value={`content:${today.toISOString().replace(".000Z", "Z")}`}
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
    expect(availableSlot).toHaveAttribute("aria-pressed", "true");
    expect(availableSlot.className).toContain("ring-blue-500");
    const otherSlot = screen.getByRole("button", {
      name: /23:42.*Regular publication/i,
    });
    expect(otherSlot).toHaveAttribute("aria-pressed", "false");
    expect(otherSlot.className).toContain("opacity-60");
    expect(availableSlot).toHaveTextContent("23:40·📝");
    expect(
      screen.getByRole("button", { name: /23:41.*Advertising.*Booked post/i }),
    ).toBeDisabled();
    fireEvent.click(availableSlot);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ slotId: "content" }),
    );
    expect(screen.getByDisplayValue(day)).toBeInTheDocument();
    expect(screen.getByDisplayValue("23:40")).toBeInTheDocument();
  });
});
