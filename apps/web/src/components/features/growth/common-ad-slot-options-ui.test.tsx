import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommonAdSlotOptions } from "./common-ad-slot-options";

const load = vi.fn();
vi.mock("@/lib/api", () => ({
  telegramPublicationSchedulesApi: {
    occurrencesByChannels: (...args: unknown[]) => load(...args),
  },
}));

describe("CommonAdSlotOptions", () => {
  beforeEach(() => load.mockReset());

  it("loads automatically and applies only a slot free in every channel", async () => {
    const slot = (time: string, state: string) => ({
      slotId: `slot-${time}`,
      scheduledAt: `2026-09-22T${time}:00.000Z`,
      title: "Advertising",
      kind: "AD",
      time,
      timezone: "UTC",
      state,
    });
    load.mockResolvedValue({
      a: [slot("10:00", "AVAILABLE"), slot("11:00", "OCCUPIED")],
      b: [slot("10:00", "AVAILABLE"), slot("11:00", "AVAILABLE")],
    });
    const onSelect = vi.fn();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <CommonAdSlotOptions
          channelIds={["b", "a"]}
          date="2026-09-22"
          selectedTime=""
          onSelect={onSelect}
        />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole("button", {
        name: /10:00.*Available in all channels/,
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /11:00.*Occupied/ }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: /10:00.*Available in all channels/ }),
    );
    expect(onSelect).toHaveBeenCalledWith("10:00");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shows a retry action when slot availability cannot be loaded", async () => {
    load
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ a: [] });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <CommonAdSlotOptions
          channelIds={["a"]}
          date="2026-09-22"
          selectedTime=""
          onSelect={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load slots",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("No advertising slots for this date."),
    ).toBeVisible();
  });

  it("shows loading automatically when the selected channels change", async () => {
    load.mockResolvedValueOnce({ a: [] });
    load.mockImplementationOnce(() => new Promise(() => {}));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const content = (channelIds: string[]) => (
      <QueryClientProvider client={client}>
        <CommonAdSlotOptions
          channelIds={channelIds}
          date="2026-09-22"
          selectedTime=""
          onSelect={vi.fn()}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(content(["a"]));
    expect(
      await screen.findByText("No advertising slots for this date."),
    ).toBeVisible();
    rerender(content(["a", "b"]));
    expect(await screen.findByText("Loading slots…")).toBeVisible();
    expect(load).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("button", { name: /Choose advertising slot/ }),
    ).not.toBeInTheDocument();
  });
});
