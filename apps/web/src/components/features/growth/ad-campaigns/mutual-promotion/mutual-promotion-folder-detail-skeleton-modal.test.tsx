import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MutualPromotionFolderDetailSkeletonModal } from "./mutual-promotion-folder-detail-skeleton-modal";

describe("MutualPromotionFolderDetailSkeletonModal", () => {
  it("uses the full detail-dialog layout and remains dismissible", () => {
    const onClose = vi.fn();
    render(
      <MutualPromotionFolderDetailSkeletonModal
        open
        title="September exchange"
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveClass("max-w-[1280px]");
    expect(screen.getByText("September exchange")).toBeVisible();
    expect(
      screen.getByRole("status", { name: "Loading folder details…" }),
    ).toHaveAttribute("aria-busy", "true");

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
