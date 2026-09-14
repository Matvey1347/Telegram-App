import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { TelegramPostBatch } from "@telegram-system/shared";
import { render } from "@testing-library/react";
import { TestI18nProvider } from "@/test/render-with-i18n";
import { PostBatchAssociations } from "./post-batch-associations";

const apiMocks = vi.hoisted(() => ({
  linkTargets: vi.fn().mockResolvedValue([
    { type: "AD_SALE", entityId: "sale-1", title: "Autumn campaign" },
  ]),
}));

vi.mock("@/lib/features/telegram/telegram-post-batches-api", () => ({
  telegramPostBatchesApi: apiMocks,
}));

const batch = {
  id: "batch-1",
  status: "DRAFT",
  associations: [],
} as unknown as TelegramPostBatch;

describe("PostBatchAssociations", () => {
  it("shows a visible error when attaching is rejected", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onLink = vi.fn().mockRejectedValue(new Error("Rejected"));
    render(
      <QueryClientProvider client={queryClient}>
        <TestI18nProvider>
          <PostBatchAssociations
            batch={batch}
            linking={false}
            onLink={onLink}
          />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Attach to a workflow/ }),
    );
    await waitFor(() => expect(apiMocks.linkTargets).toHaveBeenCalled());
    const targetSelect = await screen.findByRole("button", {
      name: "Choose a workflow",
    });
    fireEvent.click(targetSelect);
    fireEvent.click(
      await screen.findByRole("button", { name: /Autumn campaign/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));

    expect(
      await screen.findByText("Could not attach this batch."),
    ).toBeVisible();
  });
});
