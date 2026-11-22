import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiPostingWatermarkPreview } from "./ai-posting-watermark-preview";

describe("AI Posting watermark preview", () => {
  it("updates size and opacity on the same legacy photo immediately", () => {
    const props = {
      imageUrl: "https://example.test/photo.jpg",
      avatarUrl: "https://example.test/avatar.jpg",
      legacy: true,
      settings: {
        enabled: true, size: 12, opacity: 100, x: 100, y: 100,
        legacySize: 12, onPositionChange: vi.fn(),
      },
    };
    const { rerender } = render(<AiPostingWatermarkPreview {...props} />);
    const watermark = screen.getByRole("button", { name: "Переместить водяной знак" });
    rerender(<AiPostingWatermarkPreview {...props} settings={{ ...props.settings, size: 20, opacity: 25 }} />);
    expect(watermark.style.getPropertyValue("--watermark-size")).toBe("20cqmin");
    expect(watermark.style.opacity).toBe("0.25");
  });
});
