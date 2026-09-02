import { screen } from "@testing-library/react";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { describe, expect, it, vi } from "vitest";
import { ManagedPostsImportList } from "./managed-posts-import-list";
import { rowToEditable } from "./managed-posts-import-model";

describe("ManagedPostsImportList", () => {
  it("shows approved posts in New with a badge and no Approved tab", () => {
    const rows = [
      rowToEditable({ title: "Approved post", approved: true }),
      rowToEditable({ title: "Imported post", imported: true }),
    ];

    const { container } = render(
      <ManagedPostsImportList
        rows={rows}
        visibleRowIndices={[0]}
        selectedRowIndex={0}
        activeTab="new"
        tabCounts={{ new: 1, imported: 1 }}
        disabled={false}
        onSelectRow={vi.fn()}
        onSelectTab={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "New (1)" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Imported (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /approved \(/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("✓ Approved")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("xl:col-start-3");
  });
});
