import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SaleDetailsModal } from "./ad-sales-sale-details-modal";

vi.mock("@/components/features/workspace/member-select", () => ({
  MemberSelect: () => <div>Member selector</div>,
}));

vi.mock("./placement-post/placement-post-composer", () => ({
  PlacementPostComposer: ({
    draft,
    onChange,
  }: {
    draft: { title: string };
    onChange: (next: {
      draft: { title: string };
      telegramPostId: null;
    }) => void;
  }) => (
    <label>
      Title
      <input
        aria-label="Title"
        value={draft.title}
        onChange={(event) =>
          onChange({
            draft: { ...draft, title: event.target.value },
            telegramPostId: null,
          })
        }
      />
    </label>
  ),
}));

describe("SaleDetailsModal", () => {
  it("shows a deal-shaped skeleton while the requested deal is loading", () => {
    render(
      <SaleDetailsModal
        open
        loading
        sale={null}
        onClose={vi.fn()}
        accounts={[]}
        channels={[]}
        productsByChannelId={{}}
        settings={undefined}
        rates={undefined}
        onSave={vi.fn()}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Loading deal")).toBeTruthy();
    expect(screen.queryByText("Psychology")).toBeNull();
  });

  it("opens a lightweight deal overview before editing one placement", async () => {
    const user = userEvent.setup();
    render(
      <SaleDetailsModal
        open
        onClose={vi.fn()}
        sale={sale}
        accounts={[]}
        channels={[
          {
            id: "channel-1",
            title: "Psychology",
            photoUrl: "https://example.com/psychology.jpg",
          } as never,
        ]}
        productsByChannelId={{
          "channel-1": [{ id: "format-1", name: "1/24" } as never],
        }}
        settings={undefined}
        rates={undefined}
        onSave={vi.fn()}
        onAction={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Choose the placement you want to edit."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Edit transaction" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Price (UAH)")).toBeNull();
    expect(
      screen.getByRole("link", { name: /Open in system/ }),
    ).toHaveAttribute("href", "/telegram-posts/channel-1/editor?postId=post-1");
    expect(
      screen.getByRole("link", { name: /Open in Telegram/ }),
    ).toHaveAttribute("href", "https://t.me/example/42");
    expect(screen.queryByText(/Published in Telegram/)).toBeNull();
    expect(screen.getAllByLabelText("Views: 1234")).toHaveLength(2);
    expect(screen.getAllByLabelText("Reactions: 56")).toHaveLength(2);
    expect(screen.getAllByLabelText("Forwards: 7")).toHaveLength(2);
    expect(screen.getAllByLabelText("Comments: 8")).toHaveLength(2);

    await user.click(
      screen.getByRole("button", { name: "Edit placement Psychology" }),
    );

    expect(screen.getByText("Edit placement")).toBeTruthy();
    expect(screen.queryByText("RESERVED")).toBeNull();
    expect(screen.getByRole("img", { name: "Psychology" })).toBeTruthy();
    expect(
      screen.getByText("Recommended 170.7 UAH · minimum 100 UAH"),
    ).toBeTruthy();
    expect(screen.getByText("Managed post linked")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change post" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Open in system/ }),
    ).toHaveAttribute("href", "/telegram-posts/channel-1/editor?postId=post-1");
    expect(
      screen.getByRole("link", { name: /Open in Telegram/ }),
    ).toHaveAttribute("href", "https://t.me/example/42");
  });

  it("saves an edited buyer with the rest of the deal", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <SaleDetailsModal
        open
        onClose={onClose}
        sale={sale}
        accounts={[]}
        channels={[{ id: "channel-1", title: "Psychology" } as never]}
        productsByChannelId={{}}
        settings={undefined}
        rates={undefined}
        onSave={onSave}
        onAction={vi.fn()}
      />,
    );

    const buyer = screen.getByPlaceholderText("@username, phone, email");
    await user.clear(buyer);
    await user.type(buyer, "@new_buyer");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onClose).toHaveBeenCalledTimes(1);

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        sale,
        expect.objectContaining({ buyerContact: "@new_buyer" }),
      ),
    );
  });

  it("edits one shared post and saves it for every linked placement", async () => {
    const user = userEvent.setup();
    const onUpdateSharedPost = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const source = sale as unknown as Record<string, unknown> & {
      placements: Array<Record<string, unknown>>;
    };
    const sharedSale = {
      ...source,
      placements: [
        source.placements[0],
        {
          ...source.placements[0],
          id: "placement-2",
          telegramChannelId: "channel-2",
          managedPostId: "post-2",
          managedPost: {
            ...(source.placements[0].managedPost as Record<string, unknown>),
            id: "post-2",
          },
        },
      ],
    } as never;

    render(
      <SaleDetailsModal
        open
        onClose={onClose}
        sale={sharedSale}
        accounts={[]}
        channels={[
          { id: "channel-1", title: "Psychology" } as never,
          { id: "channel-2", title: "Business" } as never,
        ]}
        productsByChannelId={{}}
        settings={undefined}
        rates={undefined}
        onSave={vi.fn()}
        onAction={vi.fn()}
        onUpdateSharedPost={onUpdateSharedPost}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit shared post" }));
    expect(screen.getByText("Edit shared post")).toBeTruthy();
    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Updated campaign");
    await user.click(
      screen.getByRole("button", { name: "Update in all channels" }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(onUpdateSharedPost).toHaveBeenCalledWith(
        sharedSale,
        expect.objectContaining({ title: "Updated campaign" }),
      ),
    );
  });

  it("uses an inline link field and says Add post when no post is linked", async () => {
    const user = userEvent.setup();
    const onLoadPlacementPosts = vi.fn().mockResolvedValue([
      {
        id: "telegram-post-42",
        title: "Campaign post",
        publishedAt: "2026-08-25T10:00:00.000Z",
      },
    ]);
    const onAttachPost = vi.fn().mockResolvedValue(undefined);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const sourceSale = sale as unknown as Record<string, unknown> & {
      placements: Array<Record<string, unknown>>;
    };
    const saleWithoutPost = {
      ...sourceSale,
      placements: sourceSale.placements.map((placement) => ({
        ...placement,
        managedPostId: null,
        telegramPostId: null,
      })),
    } as never;
    render(
      <SaleDetailsModal
        open
        onClose={vi.fn()}
        sale={saleWithoutPost}
        accounts={[]}
        channels={[{ id: "channel-1", title: "Psychology" } as never]}
        productsByChannelId={{}}
        settings={undefined}
        rates={undefined}
        onSave={onSave}
        onAction={vi.fn()}
        onAttachPost={onAttachPost}
        onLoadPlacementPosts={onLoadPlacementPosts}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Psychology/ }));
    await user.click(screen.getByRole("button", { name: "Add post" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();

    expect(screen.getByRole("button", { name: "Select post" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Paste link" }));
    await user.type(
      screen.getByPlaceholderText("https://t.me/channel/123"),
      "https://t.me/channel/42",
    );
    expect(screen.queryByText("Paste the Telegram post link")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add post" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      expect(onAttachPost).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { telegramPostUrl: "https://t.me/channel/42" },
      );
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onLoadPlacementPosts).toHaveBeenCalledTimes(1);
  });

  it("shows the scheduled post window and remaining lifecycle in the placement card", () => {
    const sourceSale = sale as unknown as Record<string, unknown> & {
      placements: Array<Record<string, unknown>>;
    };
    const saleWithLifecycle = {
      ...sourceSale,
      placements: sourceSale.placements.map((placement) => ({
        ...placement,
        telegramPostId: "telegram-post-42",
        publishedAt: "2026-08-25T14:00:00.000Z",
        plannedDeleteAt: "2026-08-26T17:00:00.000Z",
      })),
    } as never;

    render(
      <SaleDetailsModal
        open
        onClose={vi.fn()}
        sale={saleWithLifecycle}
        accounts={[]}
        channels={[{ id: "channel-1", title: "Psychology" } as never]}
        productsByChannelId={{}}
        settings={undefined}
        rates={undefined}
        onSave={vi.fn()}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText(/25\/08\/2026.*→.*26\/08\/2026/)).toBeTruthy();
    expect(screen.getByText("Automatic deletion pending")).toBeTruthy();
  });

  it("keeps only the system link after a post was automatically deleted", () => {
    const sourceSale = sale as unknown as Record<string, unknown> & {
      placements: Array<Record<string, unknown>>;
    };
    const deletedSale = {
      ...sourceSale,
      placements: sourceSale.placements.map((placement) => ({
        ...placement,
        publishedAt: "2026-08-25T14:00:00.000Z",
        plannedDeleteAt: "2026-08-26T14:00:00.000Z",
        deletedAt: "2026-08-26T14:00:05.000Z",
      })),
    } as never;

    render(
      <SaleDetailsModal
        open
        onClose={vi.fn()}
        sale={deletedSale}
        accounts={[]}
        channels={[{ id: "channel-1", title: "Psychology" } as never]}
        productsByChannelId={{}}
        settings={undefined}
        rates={undefined}
        onSave={vi.fn()}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Automatically deleted")).toHaveClass(
      "text-neutral-500",
    );
    expect(screen.getByRole("link", { name: /Open in system/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Open in Telegram/ })).toBeNull();
  });
});

const sale = {
  id: "sale-1",
  advertiserName: "@astrakarmaved",
  advertiserTelegram: "@astrakarmaved",
  advertiserTelegramSnapshot: "@astrakarmaved",
  title: null,
  origin: "DIRECT",
  assignedMemberId: "member-1",
  status: "RESERVED",
  settlementCurrency: "UAH",
  totalAgreedAmount: "102",
  totalPaidAmount: "102",
  placements: [
    {
      id: "placement-1",
      telegramChannelId: "channel-1",
      telegramAdProductId: "format-1",
      scheduledAt: "2026-08-25T16:00:00.000Z",
      timezone: "Europe/Warsaw",
      agreedPrice: "102",
      recommendedPrice: "170.7",
      minimumPrice: "100",
      currency: "UAH",
      status: "RESERVED",
      manualPriceReason: null,
      managedPostId: "post-1",
      managedPost: {
        id: "post-1",
        title: "Campaign",
        text: "Original campaign text",
        imageUrls: [],
        buttonRows: [],
        status: "PUBLISHED",
        telegramRemoteStatus: "PUBLISHED",
        telegramMessageIds: ["42"],
        telegramMessageUrls: ["https://t.me/example/42"],
        publishedAt: "2026-08-25T16:00:00.000Z",
        scheduledAt: null,
        lastError: null,
      },
      telegramPost: {
        id: "telegram-post-42",
        viewsCount: 1234,
        reactionsCount: 56,
        forwardsCount: 7,
        commentsCount: 8,
        postDate: "2026-08-25T16:00:00.000Z",
      },
    },
  ],
  payments: [
    {
      id: "payment-1",
      accountId: "account-1",
      amount: "102",
      currency: "UAH",
      paidAt: "2026-08-24T04:52:00.000Z",
      notes: null,
      status: "ACTIVE",
    },
  ],
} as never;
