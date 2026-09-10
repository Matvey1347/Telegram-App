import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { uiCopy } from "@/lib/ui-i18n";
import { IconImageUploadPanel } from "./icon-image-upload-panel";

function renderPanel(onFile = vi.fn()) {
  render(
    <IconImageUploadPanel
      copy={uiCopy("en")}
      upload={null}
      uploadName=""
      uploading={false}
      disabled={false}
      saveReusableOpen={false}
      onChooseFile={vi.fn()}
      onFile={onFile}
      onUploadName={vi.fn()}
      onBeginSaveReusable={vi.fn()}
      onUseOnce={vi.fn()}
      onSaveReusable={vi.fn()}
      onBack={vi.fn()}
    />,
  );
  return onFile;
}

describe("IconImageUploadPanel", () => {
  it("accepts an image pasted through clipboard items", () => {
    const onFile = renderPanel();
    const file = new File(["image"], "pasted.png", { type: "image/png" });

    fireEvent.paste(
      screen.getByRole("region", {
        name: "Image upload drop and paste area",
      }),
      {
        clipboardData: {
          files: [],
          items: [
            {
              kind: "file",
              type: "image/png",
              getAsFile: () => file,
            },
          ],
        },
      },
    );

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("accepts an image dropped anywhere in the dashed area", () => {
    const onFile = renderPanel();
    const file = new File(["image"], "dropped.png", { type: "image/png" });

    fireEvent.drop(
      screen.getByRole("region", {
        name: "Image upload drop and paste area",
      }),
      { dataTransfer: { files: [file] } },
    );

    expect(onFile).toHaveBeenCalledWith(file);
  });
});
