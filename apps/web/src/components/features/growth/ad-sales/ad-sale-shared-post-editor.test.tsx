import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramSystemBotApi } from "@/lib/api";
import { AdSaleSharedPostEditor } from "./ad-sale-shared-post-editor";

vi.mock("@/lib/api", () => ({
  telegramSystemBotApi: {
    sendPostPreview: vi.fn(),
  },
}));

vi.mock("./placement-post/placement-post-composer", () => ({
  PlacementPostComposer: () => <div>Post editor</div>,
}));

describe("AdSaleSharedPostEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(telegramSystemBotApi.sendPostPreview).mockResolvedValue({
      status: "SENT",
    });
  });

  it("sends the current unsaved shared-post draft to the System Bot", async () => {
    const draft = {
      title: "Shared campaign",
      text: "Current post copy",
      imageUrls: ["https://cdn.test/post.jpg"],
      buttonRows: [[{ text: "Open", url: "https://example.com", style: "primary" }]],
    };
    const sale = {
      id: "sale-1",
      placements: [{ managedPost: draft }],
    } as never;

    render(
      <AdSaleSharedPostEditor
        sale={sale}
        channelTitle="Advertising post"
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send post to bot" }));

    expect(await screen.findByText("✅ Sent to bot")).toBeInTheDocument();
    expect(telegramSystemBotApi.sendPostPreview).toHaveBeenCalledWith(
      expect.objectContaining(draft),
    );
  });
});
