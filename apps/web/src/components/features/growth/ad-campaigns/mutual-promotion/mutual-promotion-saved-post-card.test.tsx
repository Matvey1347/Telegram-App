import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MutualPromotionSavedPostCard } from "./mutual-promotion-saved-post-card";

vi.mock("./mutual-promotion-post-composer", () => ({
  MutualPromotionPostComposer: ({
    draft,
    onChange,
  }: {
    draft: {
      title: string;
      text: string;
      imageUrls: string[];
      buttonRows: never[];
    };
    onChange: (draft: {
      title: string;
      text: string;
      imageUrls: string[];
      buttonRows: never[];
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          title: "Edited title",
          text: "Edited body",
          imageUrls: ["https://cdn.test/edited.jpg"],
          buttonRows: [],
        })
      }
    >
      Edit content: {draft.text}
    </button>
  ),
}));

const post = {
  id: "post-1",
  title: "Visible title",
  text: "Secret body",
  imageUrls: [],
  buttonRows: [],
  scheduledAt: "2026-09-08T17:00:00.000Z",
  position: 0,
  deliveries: [],
  createdAt: "2026-09-08T16:00:00.000Z",
  updatedAt: "2026-09-08T16:00:00.000Z",
};

describe("MutualPromotionSavedPostCard", () => {
  it("keeps the list compact and edits content and schedule from the pencil", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <MutualPromotionSavedPostCard
        post={post}
        index={0}
        editable
        timezone="Europe/Warsaw"
        startsAt="2026-09-08T08:00:00.000Z"
        endsAt="2026-09-10T20:00:00.000Z"
        channelTitle="Publisher"
        saving={false}
        onSave={onSave}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("1. Visible title")).toBeVisible();
    expect(screen.queryByText("Secret body")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit time")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit publication 1" }));
    fireEvent.click(screen.getByRole("button", { name: /Edit content:/ }));
    fireEvent.click(screen.getByRole("button", { name: "08.09.2026" }));
    fireEvent.click(screen.getAllByRole("button", { name: "9" })[0]);
    fireEvent.change(screen.getByLabelText("Time"), {
      target: { value: "20:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save publication" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("post-1", {
        scheduledAt: "2026-09-09T18:30:00.000Z",
        title: "Edited title",
        text: "Edited body",
        imageUrls: ["https://cdn.test/edited.jpg"],
        buttonRows: [],
      }),
    );
    expect(screen.queryByLabelText("Publication date")).not.toBeInTheDocument();
  });

  it("removes the selected publication from the trash icon", async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(
      <MutualPromotionSavedPostCard
        post={post}
        index={2}
        editable
        timezone="Europe/Warsaw"
        startsAt="2026-09-08T08:00:00.000Z"
        endsAt="2026-09-10T20:00:00.000Z"
        channelTitle="Publisher"
        saving={false}
        onSave={vi.fn()}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Remove publication 3" }),
    );
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith("post-1"));
  });
});
