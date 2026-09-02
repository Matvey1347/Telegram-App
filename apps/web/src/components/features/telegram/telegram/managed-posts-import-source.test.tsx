import { fireEvent, screen } from "@testing-library/react";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { describe, expect, it, vi } from "vitest";
import { ManagedPostsImportSource } from "./managed-posts-import-source";

function renderSource(content = "") {
  const onContent = vi.fn();
  const onFile = vi.fn();
  const view = render(
    <ManagedPostsImportSource
      content={content}
      fileName={null}
      disabled={false}
      onContent={onContent}
      onFile={onFile}
      onClear={vi.fn()}
      onCopyContent={vi.fn()}
    />,
  );
  return { ...view, onContent, onFile };
}

describe("ManagedPostsImportSource", () => {
  it("accepts pasted text in the empty drop zone", () => {
    const { onContent } = renderSource();

    fireEvent.paste(
      screen.getByRole("region", { name: "File drop and paste area" }),
      {
        clipboardData: {
          files: [],
          getData: () => '[{"title":"Pasted"}]',
        },
      },
    );

    expect(onContent).toHaveBeenCalledWith('[{"title":"Pasted"}]');
  });

  it("turns loaded content into a text editor with a copy action", () => {
    renderSource('[{"title":"Loaded"}]');

    expect(screen.getByRole("textbox", { name: "Import data" })).toHaveValue(
      '[{"title":"Loaded"}]',
    );
    expect(
      screen.getByRole("button", { name: "Copy import data" }),
    ).toBeInTheDocument();
    const copy = screen.getByRole("button", { name: "Copy import data" });
    const replace = screen.getByText("Replace").closest("label");
    const clear = screen.getByRole("button", { name: "Clear" });

    for (const action of [copy, replace, clear]) {
      expect(action).toHaveClass("h-9", "w-[104px]", "text-sm");
    }
  });

  it("accepts a dropped file", () => {
    const { onFile } = renderSource();
    const file = new File(['[{"title":"Dropped"}]'], "posts.json", {
      type: "application/json",
    });

    fireEvent.drop(
      screen.getByRole("region", { name: "File drop and paste area" }),
      {
        dataTransfer: { files: [file] },
      },
    );

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("opens the file picker only from the Choose file button", () => {
    renderSource();
    const zone = screen.getByRole("region", {
      name: "File drop and paste area",
    });
    const input = zone.querySelector('input[type="file"]') as HTMLInputElement;
    const inputClick = vi.spyOn(input, "click");

    fireEvent.click(zone);
    expect(inputClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Choose file" }));
    expect(inputClick).toHaveBeenCalledOnce();
  });
});
