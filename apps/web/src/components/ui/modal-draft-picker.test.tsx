import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModalDraftPicker } from "./modal-draft-picker";

vi.mock("@/lib/api", () => ({
  iconsApi: {
    list: vi
      .fn()
      .mockResolvedValue([
        { id: "legacy-icon", type: "emoji", name: "Handshake", emoji: "🤝" },
      ]),
  },
}));

describe("ModalDraftPicker", () => {
  it("shows the persisted emoji preview and keeps actions icon-only", () => {
    const draft = {
      version: 1 as const,
      id: "draft-1",
      form: { title: "Mutual promo" },
      preview: { icon: { type: "unicode" as const, value: "🤝" } },
    };
    const onContinue = vi.fn();
    const onDelete = vi.fn();

    render(
      <ModalDraftPicker
        drafts={[draft]}
        titleFor={(form) => form.title}
        onContinue={onContinue}
        onDelete={onDelete}
        onCreateNew={vi.fn()}
      />,
    );

    expect(screen.getByText("🤝")).toBeInTheDocument();
    const continueButton = screen.getByRole("button", {
      name: "Continue draft Mutual promo",
    });
    const deleteButton = screen.getByRole("button", {
      name: "Delete draft Mutual promo",
    });
    expect(continueButton).toHaveTextContent("");
    expect(deleteButton).toHaveClass("text-red-300");

    fireEvent.click(continueButton);
    fireEvent.click(deleteButton);
    expect(onContinue).toHaveBeenCalledWith(draft);
    expect(onDelete).toHaveBeenCalledWith(draft);
  });

  it("renders older drafts that have no preview metadata", () => {
    render(
      <ModalDraftPicker
        drafts={[{ version: 1, id: "legacy", form: { title: "Legacy draft" } }]}
        titleFor={(form) => form.title}
        onContinue={vi.fn()}
        onDelete={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    expect(screen.getByText("Legacy draft")).toBeInTheDocument();
  });

  it("resolves an old draft icon from the shared icon collection", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ModalDraftPicker
          drafts={[
            {
              version: 1,
              id: "legacy",
              form: { title: "Legacy draft", iconId: "legacy-icon" },
            },
          ]}
          titleFor={(form) => form.title}
          onContinue={vi.fn()}
          onDelete={vi.fn()}
          onCreateNew={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("🤝")).toBeInTheDocument();
  });
});
