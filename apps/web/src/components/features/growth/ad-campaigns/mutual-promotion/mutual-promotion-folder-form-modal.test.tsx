import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MutualPromotionFolderFormModal } from "./mutual-promotion-folder-form-modal";

function renderModal(folder: Parameters<typeof MutualPromotionFolderFormModal>[0]["folder"] = null) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MutualPromotionFolderFormModal
        open
        folder={folder}
        timezone="Europe/Warsaw"
        channels={[]}
        accounts={[]}
        resourcesLoading={false}
        resourcesError={false}
        saving={false}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />
    </QueryClientProvider>,
  );
}

describe("MutualPromotionFolderFormModal drafts", () => {
  beforeEach(() => window.localStorage.clear());

  it("offers to continue every saved draft and restores its form", async () => {
    const first = renderModal();
    fireEvent.change(screen.getByPlaceholderText("September // [date-range]"), {
      target: { value: "September exchange" },
    });
    await waitFor(() =>
      expect(
        window.localStorage.getItem("mutual-promotion-folder:draft:default"),
      ).toContain("September exchange"),
    );
    first.unmount();

    renderModal();
    expect(await screen.findByText("September exchange")).toBeInTheDocument();
    const continueButton = screen.getByRole("button", {
      name: "Continue draft September exchange",
    });
    expect(continueButton).toHaveTextContent("");
    fireEvent.click(continueButton);
    expect(
      screen.getByPlaceholderText("September // [date-range]"),
    ).toHaveValue("September exchange");
  });

  it("deletes a draft without opening it", async () => {
    window.localStorage.setItem(
      "mutual-promotion-folder:draft:default",
      JSON.stringify({
        version: 2,
        drafts: [
          {
            version: 1,
            id: "draft-1",
            form: {
              title: "Delete me",
              startsDate: "2026-09-08",
              startsTime: "12:00",
              endsDate: "2026-09-09",
              endsTime: "12:00",
              notes: "",
              participants: [],
            },
          },
        ],
      }),
    );
    renderModal();

    const deleteButton = await screen.findByRole("button", {
      name: "Delete draft Delete me",
    });
    expect(deleteButton).toHaveClass("border-red-700", "text-red-300");
    fireEvent.click(deleteButton);
    expect(
      window.localStorage.getItem("mutual-promotion-folder:draft:default"),
    ).toBeNull();
    expect(
      screen.getByPlaceholderText("September // [date-range]"),
    ).toBeVisible();
  });

  it("keeps old drafts when starting and saving another one", async () => {
    window.localStorage.setItem(
      "mutual-promotion-folder:draft:default",
      JSON.stringify({
        version: 2,
        drafts: [
          {
            version: 1,
            id: "first",
            form: {
              title: "First draft",
              startsDate: "2026-09-08",
              startsTime: "12:00",
              endsDate: "2026-09-09",
              endsTime: "12:00",
              notes: "",
              participants: [],
            },
          },
        ],
      }),
    );
    renderModal();
    fireEvent.click(await screen.findByRole("button", { name: "Create new" }));
    fireEvent.change(screen.getByPlaceholderText("September // [date-range]"), {
      target: { value: "Second draft" },
    });

    await waitFor(() => {
      const stored = window.localStorage.getItem(
        "mutual-promotion-folder:draft:default",
      );
      expect(stored).toContain("First draft");
      expect(stored).toContain("Second draft");
    });
  });

  it("restores unfinished edits without mixing them with create drafts", async () => {
    const folder = {
      id: "folder-1",
      title: "Published title",
      titleTemplate: "Published title",
      startsAt: "2026-09-08T08:00:00.000Z",
      endsAt: "2026-09-10T08:00:00.000Z",
      notes: null,
      participants: [],
    } as never;
    const first = renderModal(folder);
    fireEvent.change(screen.getByPlaceholderText("September // [date-range]"), {
      target: { value: "Unfinished edited title" },
    });
    await waitFor(() =>
      expect(
        window.localStorage.getItem(
          "mutual-promotion-folder:edit:folder-1:draft:default",
        ),
      ).toContain("Unfinished edited title"),
    );
    expect(
      window.localStorage.getItem("mutual-promotion-folder:draft:default"),
    ).toBeNull();
    first.unmount();

    renderModal(folder);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Continue draft Unfinished edited title",
      }),
    );
    expect(screen.getByPlaceholderText("September // [date-range]")).toHaveValue(
      "Unfinished edited title",
    );
  });

  it("highlights the title preview and explains the publication step", () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("September // [date-range]"), {
      target: { value: "September // [date-range]" },
    });

    expect(screen.getByText(/^Preview:/)).toHaveClass("text-blue-300");
    expect(
      screen.getByText("Next: forward and schedule publications"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Create folder & add posts" }),
    ).toBeVisible();
  });
});
