import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { MutualPromotionFolderCard } from "./mutual-promotion-folder-card";

const folder = {
  id: "folder-1",
  title: "September campaign",
  status: "ACTIVE",
  startsAt: "2026-09-08T17:00:00.000Z",
  endsAt: "2026-09-10T20:00:00.000Z",
  participantCount: 4,
  publisherCount: 2,
  paidCount: 2,
  postCount: 5,
  channels: [
    {
      id: "channel-1",
      title: "Channel One",
      username: "channel_one",
      photoUrl: "https://example.com/one.jpg",
      role: "PUBLISHER",
      stats: {
        joinedCount: 27,
        unsubscribedCount: 63,
        subscriberPrice: null,
        currency: null,
      },
      kpi: {
        currency: "UAH",
        targetFrom: null,
        targetTo: 9,
        acceptableFrom: null,
        acceptableTo: null,
        stopFrom: 12,
        stopTo: null,
      },
    },
    {
      id: "channel-2",
      title: "Channel Two",
      username: null,
      photoUrl: "https://example.com/two.jpg",
      role: "PAID",
      stats: {
        joinedCount: 29,
        unsubscribedCount: 33,
        subscriberPrice: 250 / 29,
        currency: "UAH",
      },
      kpi: {
        currency: "UAH",
        targetFrom: null,
        targetTo: 9,
        acceptableFrom: null,
        acceptableTo: null,
        stopFrom: 12,
        stopTo: null,
      },
    },
    {
      id: "channel-3",
      title: "Channel Three",
      username: null,
      photoUrl: "https://example.com/three.jpg",
      role: "PAID",
      stats: {
        joinedCount: 26,
        unsubscribedCount: 23,
        subscriberPrice: 250 / 26,
        currency: "UAH",
      },
      kpi: {
        currency: "UAH",
        targetFrom: null,
        targetTo: 9,
        acceptableFrom: null,
        acceptableTo: null,
        stopFrom: 12,
        stopTo: null,
      },
    },
    {
      id: "channel-4",
      title: "Channel Four",
      username: null,
      photoUrl: "https://example.com/four.jpg",
      role: "PUBLISHER",
      stats: {
        joinedCount: 30,
        unsubscribedCount: 57,
        subscriberPrice: null,
        currency: null,
      },
      kpi: {
        currency: "UAH",
        targetFrom: null,
        targetTo: 9,
        acceptableFrom: null,
        acceptableTo: null,
        stopFrom: 12,
        stopTo: null,
      },
    },
  ],
} as never;

describe("MutualPromotionFolderCard", () => {
  it("shows role avatars in the metrics and opens compact role popovers", async () => {
    const user = userEvent.setup();
    render(<MutualPromotionFolderCard folder={folder} onOpen={vi.fn()} />);

    expect(screen.getByText("Active")).toHaveClass("text-emerald-200");
    expect(screen.getByRole("article").className).not.toContain("shadow-[");
    expect(screen.getAllByRole("img")).toHaveLength(4);
    const performance = screen.getByLabelText("Channel performance");
    expect(within(performance).getByText("29")).toBeInTheDocument();
    expect(within(performance).queryByText("33")).not.toBeInTheDocument();
    expect(within(performance).getByText("8.62 UAH")).toBeInTheDocument();
    expect(within(performance).getByText("8.62 UAH")).toHaveClass(
      "text-emerald-300",
    );
    expect(within(performance).getByText("9.62 UAH")).toHaveClass(
      "text-yellow-300",
    );
    expect(within(performance).getAllByText("💳 Paid")).toHaveLength(2);
    expect(within(performance).getAllByText("📣 Publisher")).toHaveLength(2);
    expect(within(performance).getAllByText("Joined")).toHaveLength(4);
    expect(within(performance).getAllByText("Left ≈")).toHaveLength(2);
    expect(within(performance).getAllByText("Price")).toHaveLength(2);

    await user.hover(within(performance).getByText("8.62 UAH"));
    expect(await screen.findByText("KPI (UAH)")).toBeInTheDocument();
    expect(screen.getByText("target to 9.00 UAH")).toBeInTheDocument();
    expect(screen.getByText("ok 9.00–12.00 UAH")).toBeInTheDocument();
    expect(screen.getByText("stop from 12.00 UAH")).toBeInTheDocument();
    expect(screen.getByText("08/09/2026, 19:00").parentElement).toHaveClass(
      "whitespace-nowrap",
    );
    expect(
      screen.getByRole("button", { name: "Open folder September campaign" }),
    ).not.toHaveClass("focus-visible:ring-blue-500");
    expect(
      screen.queryByRole("button", {
        name: "View 4 channels in September campaign",
      }),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "View 2 publishers channels" }),
    );

    const publisherMenu = screen.getByRole("menu", {
      name: "Publishers channels",
    });
    expect(within(publisherMenu).getByText("Channel One")).toBeTruthy();
    expect(within(publisherMenu).getByText("Channel Four")).toBeTruthy();
    expect(within(publisherMenu).queryByText("Channel Two")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "View 2 paid channels" }),
    );

    const paidMenu = screen.getByRole("menu", { name: "Paid channels" });
    expect(within(paidMenu).getByText("Channel Two")).toBeTruthy();
    expect(within(paidMenu).getByText("Channel Three")).toBeTruthy();
    expect(within(paidMenu).queryByText("Channel One")).toBeNull();
  });
});
