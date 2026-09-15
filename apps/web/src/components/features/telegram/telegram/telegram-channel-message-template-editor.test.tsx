import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TelegramChannelMessageTemplateEditor } from "./telegram-channel-message-template-editor";

vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: () => <button type="button">Choose emoji</button>,
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));

describe("TelegramChannelMessageTemplateEditor", () => {
  it("uses an icon-only back action", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <TelegramChannelMessageTemplateEditor
          channels={[]}
          networks={[]}
          draftId="draft-1"
          onBack={vi.fn()}
          onSaved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Back to templates" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Back to templates")).not.toBeInTheDocument();
  });

  it("configures channel information through grouped controls", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <TelegramChannelMessageTemplateEditor
          channels={[]}
          networks={[]}
          draftId="draft-1"
          onBack={vi.fn()}
          onSaved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("tab", { name: "Template" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByLabelText("Template body")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Channel info" }));

    expect(screen.getByRole("switch", { name: /TgStat link/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("switch", { name: /Short description/ }),
    ).toHaveAttribute("aria-checked", "false");
  });
});
