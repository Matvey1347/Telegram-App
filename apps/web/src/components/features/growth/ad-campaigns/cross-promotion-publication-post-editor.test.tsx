import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CrossPromotionPublicationPostEditor } from "./cross-promotion-publication-post-editor";

vi.mock("./mutual-promotion/mutual-promotion-post-composer", () => ({
  MutualPromotionPostComposer: ({ channelTitle }: { channelTitle: string }) => (
    <div>Composer for {channelTitle}</div>
  ),
}));

const emptyPost = {
  title: "",
  text: "",
  imageUrls: [],
  buttonRows: [],
};

describe("CrossPromotionPublicationPostEditor", () => {
  it("offers partner-post import and manual composition on my side", () => {
    const onImport = vi.fn();

    render(
      <CrossPromotionPublicationPostEditor
        directMutual
        post={emptyPost}
        publishingChannel={{ id: "mine", title: "My channel" } as never}
        botConnected
        importStatus="idle"
        sendStatus="idle"
        onImport={onImport}
        onSend={vi.fn()}
        onUseSelectedPromo={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Partner post I publish")).toBeInTheDocument();
    expect(screen.queryByText("Composer for My channel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Write manually" }));
    expect(screen.getByText("Composer for My channel")).toBeInTheDocument();
  });

  it("opens the editor and starts bot import from the collapsed state", () => {
    const onImport = vi.fn();
    render(
      <CrossPromotionPublicationPostEditor
        directMutual
        post={emptyPost}
        botConnected
        importStatus="idle"
        sendStatus="idle"
        onImport={onImport}
        onSend={vi.fn()}
        onUseSelectedPromo={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Import through bot/i }),
    );
    expect(onImport).toHaveBeenCalledOnce();
    expect(screen.getByText("Composer for Publishing channel")).toBeVisible();
  });
});
