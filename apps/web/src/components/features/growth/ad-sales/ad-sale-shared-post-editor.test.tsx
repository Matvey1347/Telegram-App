import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramAdSale } from "@telegram-system/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdSaleSharedPostEditor } from "./ad-sale-shared-post-editor";

vi.mock("./placement-post/placement-post-composer", () => ({
  PlacementPostComposer: () => <div>Post composer</div>,
}));

describe("AdSaleSharedPostEditor", () => {
  const renderEditor = (node: React.ReactNode) =>
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        {node}
      </QueryClientProvider>,
    );

  it("offers Bot API recreation only for an MTProto post", async () => {
    const recreate = vi.fn().mockResolvedValue(undefined);
    const sale = {
      placements: [
        {
          managedPost: {
            id: "post-1",
            title: "Advertising post",
            text: "Text",
            imageUrls: [],
            buttonRows: [],
            sourceType: "MTPROTO",
          },
        },
      ],
    } as unknown as TelegramAdSale;

    renderEditor(
      <AdSaleSharedPostEditor
        sale={sale}
        channelTitle="Advertising post"
        onSave={vi.fn()}
        onRecreateViaBot={recreate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Recreate via bot" }));
    await waitFor(() => expect(recreate).toHaveBeenCalledTimes(1));
  });

  it("does not offer recreation for Bot API posts", () => {
    const sale = {
      placements: [
        {
          managedPost: {
            id: "post-1",
            title: "Advertising post",
            text: "Text",
            imageUrls: [],
            buttonRows: [],
            sourceType: "BOT",
          },
        },
      ],
    } as unknown as TelegramAdSale;
    renderEditor(
      <AdSaleSharedPostEditor
        sale={sale}
        channelTitle="Advertising post"
        onSave={vi.fn()}
        onRecreateViaBot={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Recreate via bot" }),
    ).toBeNull();
  });
});
