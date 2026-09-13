import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TelegramPostMediaUpload } from "./telegram-post-media-upload";

const uploadManagedPostMedia = vi.fn();
const pushToast = vi.fn();
vi.mock("@/lib/api", () => ({
  telegramChannelsApi: {
    uploadManagedPostMedia: (...args: unknown[]) =>
      uploadManagedPostMedia(...args),
  },
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast }),
}));

describe("TelegramPostMediaUpload", () => {
  it("uploads video through the post-media endpoint and preserves the returned kind", async () => {
    uploadManagedPostMedia.mockResolvedValue({
      kind: "VIDEO",
      url: "https://cdn.test/video.mp4",
      mimeType: "video/mp4",
    });
    const onChange = vi.fn();
    const { container } = render(
      <TelegramPostMediaUpload value={[]} onChange={onChange} />,
    );
    const file = new File(["video"], "video.mp4", { type: "video/mp4" });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        {
          kind: "VIDEO",
          url: "https://cdn.test/video.mp4",
          mimeType: "video/mp4",
        },
      ]),
    );
    expect(uploadManagedPostMedia).toHaveBeenCalledWith(file);
  });

  it("detects a GIF URL automatically and prevents mixing it with album media", () => {
    render(
      <TelegramPostMediaUpload
        value={[{ kind: "PHOTO", url: "https://cdn.test/photo.jpg" }]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Media type")).toBeNull();
    fireEvent.change(
      screen.getByPlaceholderText("Direct image, video or GIF URL"),
      {
        target: { value: "https://cdn.test/a.gif" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(pushToast).toHaveBeenCalledWith(
      "GIF/animation must be the only media item in a post.",
      "error",
    );
  });

  it("detects video and photo URLs without a media type selector", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TelegramPostMediaUpload value={[]} onChange={onChange} />,
    );
    const input = screen.getByPlaceholderText("Direct image, video or GIF URL");
    fireEvent.change(input, {
      target: { value: "https://cdn.test/clip.mp4?token=abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "VIDEO", url: "https://cdn.test/clip.mp4?token=abc" },
    ]);

    rerender(<TelegramPostMediaUpload value={[]} onChange={onChange} />);
    fireEvent.change(
      screen.getByPlaceholderText("Direct image, video or GIF URL"),
      { target: { value: "https://cdn.test/render?format=png" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "PHOTO", url: "https://cdn.test/render?format=png" },
    ]);
  });

  it("does not guess an unknown URL type", () => {
    render(<TelegramPostMediaUpload value={[]} onChange={vi.fn()} />);
    fireEvent.change(
      screen.getByPlaceholderText("Direct image, video or GIF URL"),
      { target: { value: "https://cdn.test/media/opaque-id" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(pushToast).toHaveBeenCalledWith(
      "Could not detect the media type. Use a direct image, video or GIF file URL.",
      "error",
    );
  });
});
