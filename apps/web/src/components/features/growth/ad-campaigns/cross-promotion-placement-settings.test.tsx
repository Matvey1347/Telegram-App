import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CrossPromotionPlacementSettings } from "./cross-promotion-placement-settings";

describe("CrossPromotionPlacementSettings", () => {
  it("shows the Ad Sale view estimate for the selected channel format", () => {
    render(
      <CrossPromotionPlacementSettings
        title="Formats in my channels"
        description="Expected views"
        channelIds={["channel-1"]}
        channels={[
          {
            id: "channel-1",
            title: "Mentor",
            currentSubscribersCount: 12_000,
          } as never,
        ]}
        productsByChannelId={{
          "channel-1": [
            {
              id: "format-1",
              name: "1/24",
              estimatedViews: 2_400,
            } as never,
          ],
        }}
        value={{
          formatIds: { "channel-1": "format-1" },
          times: { "channel-1": "12:30" },
        }}
        defaultDate="2026-09-14"
        defaultTime="10:00"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Formats in my channels/ }),
    );
    expect(screen.getByText("≈ 2,400 views")).toBeVisible();
    expect(screen.getByRole("button", { name: /1\/24/ })).toBeVisible();
    expect(screen.getAllByDisplayValue("12:30")).toHaveLength(2);
  });

  it("keeps a channel configurable when it has no saved formats", () => {
    render(
      <CrossPromotionPlacementSettings
        title="Partner formats"
        description="External channel"
        channelIds={["channel-2"]}
        channels={[{ id: "channel-2", title: "Partner" } as never]}
        productsByChannelId={{}}
        value={{ formatIds: {}, times: {} }}
        defaultDate="2026-09-14"
        defaultTime="10:00"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Partner formats/ }));
    expect(screen.getByRole("button", { name: "No formats" })).toBeDisabled();
    expect(screen.getByText("No estimate")).toBeVisible();
  });

  it("links each existing placement to its scheduled publication", () => {
    render(
      <CrossPromotionPlacementSettings
        title="Formats in my channels"
        description="Scheduled"
        channelIds={["channel-1"]}
        channels={[{ id: "channel-1", title: "Mentor" } as never]}
        productsByChannelId={{}}
        value={{ formatIds: {}, times: {} }}
        defaultDate="2026-09-14"
        defaultTime="10:00"
        onChange={vi.fn()}
        managedPostUrls={{
          "channel-1": "/telegram-posts/channel-1/editor?postId=post-1",
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Formats in my channels/ }),
    );
    expect(
      screen.getByRole("link", { name: "Open publication" }),
    ).toHaveAttribute(
      "href",
      "/telegram-posts/channel-1/editor?postId=post-1",
    );
  });

  it("applies one format and time to every channel while keeping individual fields", () => {
    const onChange = vi.fn();
    const onDefaultDateChange = vi.fn();
    const { container } = render(
      <CrossPromotionPlacementSettings
        title="Formats in my channels"
        description="Common settings"
        channelIds={["channel-1", "channel-2"]}
        channels={[
          { id: "channel-1", title: "First" } as never,
          { id: "channel-2", title: "Second" } as never,
        ]}
        productsByChannelId={{
          "channel-1": [{ id: "first-24", name: "1/24" } as never],
          "channel-2": [{ id: "second-24", name: "1/24" } as never],
        }}
        value={{ formatIds: {}, times: {} }}
        defaultDate="2026-09-14"
        defaultTime="10:00"
        onDefaultDateChange={onDefaultDateChange}
        onChange={onChange}
      />,
    );

    expect(screen.queryByText("First")).not.toBeInTheDocument();
    const defaults = screen.getByTestId("placement-defaults");
    expect(within(defaults).getByText("Publication date")).toBeVisible();
    expect(within(defaults).getByText("Format for all")).toBeVisible();
    expect(within(defaults).getByText("Time for all")).toBeVisible();
    expect(defaults.className).toContain(
      "grid-cols-[minmax(200px,1.05fr)_minmax(160px,.9fr)_minmax(220px,1fr)]",
    );
    expect(
      within(defaults)
        .getAllByText(/Publication date|Time for all|Format for all/)
        .map((element) => element.textContent),
    ).toEqual(["Publication date*", "Time for all", "Format for all"]);

    fireEvent.click(screen.getByRole("button", { name: "14.09.2026" }));
    fireEvent.click(screen.getByRole("button", { name: "20" }));
    expect(onDefaultDateChange).toHaveBeenCalledWith("2026-09-20");
    expect(onChange).toHaveBeenCalledWith({
      formatIds: {},
      times: {},
      dates: { "channel-1": "2026-09-20", "channel-2": "2026-09-20" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Format for all" }));
    fireEvent.click(screen.getByRole("button", { name: "1/24" }));
    expect(onChange).toHaveBeenCalledWith({
      formatIds: { "channel-1": "first-24", "channel-2": "second-24" },
      times: {},
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Time for all" }), {
      target: { value: "18:30" },
    });
    expect(onChange).toHaveBeenCalledWith({
      formatIds: {},
      times: { "channel-1": "18:30", "channel-2": "18:30" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Formats in my channels/ }),
    );
    expect(screen.getAllByText("Format")).toHaveLength(2);
    expect(screen.getAllByText("Publication date")).toHaveLength(3);
    expect(screen.getAllByText("Publication time")).toHaveLength(2);

    fireEvent.change(
      container.querySelectorAll('input[inputmode="numeric"]')[1],
      { target: { value: "16:45" } },
    );
    expect(onChange).toHaveBeenLastCalledWith({
      formatIds: {},
      times: { "channel-1": "16:45" },
      hasIndividualOverrides: true,
    });
  });

  it("opens individual channel settings when a restored draft contains overrides", () => {
    const props = {
      title: "Formats in my channels",
      description: "Common settings",
      channelIds: ["channel-1"],
      channels: [{ id: "channel-1", title: "Mentor" } as never],
      productsByChannelId: {
        "channel-1": [{ id: "format-1", name: "1/24" } as never],
      },
      defaultDate: "2026-09-14",
      defaultTime: "10:00",
      onChange: vi.fn(),
    };
    const { rerender } = render(
      <CrossPromotionPlacementSettings
        {...props}
        value={{ formatIds: {}, times: {} }}
      />,
    );

    expect(screen.queryByText("Mentor")).not.toBeInTheDocument();

    rerender(
      <CrossPromotionPlacementSettings
        {...props}
        value={{
          formatIds: { "channel-1": "format-1" },
          times: { "channel-1": "18:30" },
          hasIndividualOverrides: true,
        }}
      />,
    );

    expect(screen.getByText("Mentor")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Formats in my channels/ }),
    ).toHaveAttribute("aria-expanded", "true");
  });
});
