import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramImageUpload } from "@/components/features/telegram/telegram/telegram-image-upload";

const pushToast = vi.fn();
const uploadMock = vi.fn();

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({
    pushToast,
  }),
}));

vi.mock("@/lib/api", () => ({
  iconsApi: {
    upload: (...args: unknown[]) => uploadMock(...args),
  },
}));

describe("TelegramImageUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:test-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("uploads an image pasted from the clipboard", async () => {
    uploadMock.mockResolvedValueOnce({ imageUrl: "https://cdn.test/pasted.png" });
    const onChange = vi.fn();

    render(<TelegramImageUpload value={[]} onChange={onChange} />);

    const pasteTarget = screen.getByText(
      "Upload images, paste with Ctrl/Cmd+V, or load by image URL",
    ).closest("div[tabindex]");
    expect(pasteTarget).toBeTruthy();

    const file = new File(["image"], "pasted.png", { type: "image/png" });
    fireEvent.paste(pasteTarget as HTMLElement, {
      clipboardData: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledWith(file);
    });
    expect(onChange).toHaveBeenCalledWith(["https://cdn.test/pasted.png"]);
  });

  it("keeps an image URL without downloading or uploading it", async () => {
    const onChange = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<TelegramImageUpload value={[]} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText("https://example.com/image.png"), {
      target: { value: "https://example.com/remote.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add by url/i }));

    expect(onChange).toHaveBeenCalledWith(["https://example.com/remote.png"]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
