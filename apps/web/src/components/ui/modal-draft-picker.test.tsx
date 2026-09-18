import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceFormDraft } from "@/lib/workspace-modal-drafts";
import { ModalDraftPicker } from "./modal-draft-picker";

type Form = { title: string };
const draft = (
  id: string,
  preview?: WorkspaceFormDraft<Form>["preview"],
): WorkspaceFormDraft<Form> => ({
  id,
  createdAt: "2026-09-15T10:00:00.000Z",
  updatedAt: "2026-09-15T11:00:00.000Z",
  schemaVersion: 1,
  form: { title: `Form ${id}` },
  preview,
});

describe("ModalDraftPicker", () => {
  it("uses persisted metadata and keeps actions accessible", () => {
    const saved = draft("one", {
      title: "Mutual promo",
      subtitle: "Two channels",
      detail: "Tomorrow",
      badge: "Ready",
      icon: { type: "unicode", value: "🤝" },
    });
    const onContinue = vi.fn();
    const onDelete = vi.fn();
    render(
      <ModalDraftPicker
        drafts={[saved]}
        onContinue={onContinue}
        onDelete={onDelete}
        onCreateNew={vi.fn()}
      />,
    );
    expect(screen.getByText("🤝")).toBeInTheDocument();
    expect(screen.getByText("Two channels")).toBeVisible();
    expect(screen.getByText("Tomorrow · Ready")).toBeVisible();
    expect(screen.getByText(/^Saved \d/)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue draft Mutual promo" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete draft Mutual promo" }),
    );
    expect(onContinue).toHaveBeenCalledWith(saved);
    expect(onDelete).toHaveBeenCalledWith(saved);
  });

  it("caps avatar rendering and shows the remaining count", () => {
    render(
      <ModalDraftPicker
        drafts={[
          draft("many", {
            title: "Campaign",
            avatars: ["A", "B", "C", "D", "E"].map((label) => ({ label })),
          }),
        ]}
        onContinue={vi.fn()}
        onDelete={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );
    expect(screen.getByText("+2")).toBeVisible();
    expect(screen.getByLabelText("5 channels selected").children).toHaveLength(4);
  });

  it("falls back to local form presentation without network hydration", () => {
    render(
      <ModalDraftPicker
        drafts={[draft("legacy")]}
        titleFor={(form) => form.title}
        onContinue={vi.fn()}
        onDelete={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );
    expect(screen.getByText("Form legacy")).toBeVisible();
  });
});
