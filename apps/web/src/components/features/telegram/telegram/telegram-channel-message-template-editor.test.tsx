import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TelegramChannelMessageTemplateEditor } from "./telegram-channel-message-template-editor";

const { iconPickerSpy } = vi.hoisted(() => ({ iconPickerSpy: vi.fn() }));

vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: (props: unknown) => {
    iconPickerSpy(props);
    return <button type="button">Choose emoji</button>;
  },
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));
vi.mock("./telegram-text-editor", () => ({
  TelegramTextEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Template text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe("TelegramChannelMessageTemplateEditor", () => {
  it("uses an icon-only back action", () => {
    iconPickerSpy.mockClear();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <TelegramChannelMessageTemplateEditor
          channels={[]}
          networks={[]}
          onDraftChange={vi.fn()}
          onClearDraft={vi.fn()}
          onBack={vi.fn()}
          onSaved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Back to templates" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Back to templates")).not.toBeInTheDocument();
    expect(iconPickerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        icon: { type: "unicode", value: "📣" },
      }),
    );
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
          onDraftChange={vi.fn()}
          onClearDraft={vi.fn()}
          onBack={vi.fn()}
          onSaved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("tab", { name: "Text" })).toHaveAttribute(
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
    expect(
      screen.getByRole("radio", { name: "Title as link" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("📣 Title — 🔗 link")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Title — link" }));
    expect(screen.getByRole("radio", { name: "Title — link" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("stores the selected calculation through the inferred body token", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onDraftChange = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <TelegramChannelMessageTemplateEditor
          channels={[]}
          networks={[]}
          onDraftChange={onDraftChange}
          onClearDraft={vi.fn()}
          onBack={vi.fn()}
          onSaved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("tab", { name: "Prices" }));
    await userEvent.click(screen.getByRole("tab", { name: "Offer settings" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Sales / public CPM" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Internal CPM" }));

    await waitFor(() =>
      expect(onDraftChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            bodyTemplate: expect.stringContaining("{{product_internal_price}}"),
          }),
        }),
        expect.anything(),
      ),
    );
  });
});
