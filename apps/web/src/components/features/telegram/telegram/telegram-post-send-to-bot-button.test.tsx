import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramSystemBotApi } from "@/lib/api";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { TelegramPostSendToBotButton } from "./telegram-post-send-to-bot-button";

vi.mock("@/lib/api", () => ({
  telegramSystemBotApi: { sendPostPreview: vi.fn() },
}));

const draft = {
  title: "Current post",
  text: "Unsaved text",
  imageUrls: ["https://cdn.test/current.jpg"],
  buttonRows: [
    [{ text: "Open", url: "https://example.com", style: "primary" as const }],
  ],
};

describe("TelegramPostSendToBotButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(telegramSystemBotApi.sendPostPreview).mockResolvedValue({
      status: "SENT",
    });
  });

  it("sends the current unsaved post draft to the System Bot", async () => {
    render(<TelegramPostSendToBotButton draft={draft} />);

    fireEvent.click(screen.getByRole("button", { name: "Send to bot" }));

    expect(await screen.findByText("✓ Sent to bot")).toBeInTheDocument();
    expect(telegramSystemBotApi.sendPostPreview).toHaveBeenCalledWith(draft);
  });

  it("sends the prepared image in place of the stored image", async () => {
    const prepared = { ...draft, imageUrls: ["https://cdn.test/updated.jpg"] };
    render(<TelegramPostSendToBotButton draft={draft} prepareDraft={async () => prepared} />);
    fireEvent.click(screen.getByRole("button", { name: "Send to bot" }));
    expect(await screen.findByText("✓ Sent to bot")).toBeInTheDocument();
    expect(telegramSystemBotApi.sendPostPreview).toHaveBeenCalledExactlyOnceWith(prepared);
  });

  it("does not send the stored image if preparation fails", async () => {
    render(<TelegramPostSendToBotButton draft={draft} prepareDraft={async () => {
      throw new Error("Photo preparation failed");
    }} />);
    fireEvent.click(screen.getByRole("button", { name: "Send to bot" }));
    expect(await screen.findByText("Photo preparation failed")).toBeInTheDocument();
    expect(telegramSystemBotApi.sendPostPreview).not.toHaveBeenCalled();
  });

  it("supports a primary action while keeping the shared send behavior", () => {
    render(
      <TelegramPostSendToBotButton
        draft={draft}
        variant="primary"
        className="w-full"
      />,
    );
    expect(screen.getByRole("button", { name: "Send to bot" })).toHaveClass(
      "bg-blue-600",
      "w-full",
    );
  });

  it("does not offer an empty post for sending", () => {
    render(
      <TelegramPostSendToBotButton
        draft={{ ...draft, text: "", imageUrls: [], buttonRows: [] }}
      />,
    );

    expect(screen.getByRole("button", { name: "Send to bot" })).toBeDisabled();
  });

  it("does not send a labelled inline button without a URL", () => {
    render(
      <TelegramPostSendToBotButton
        draft={{
          ...draft,
          buttonRows: [[{ text: "Open", url: "", style: "default" }]],
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Send to bot" })).toBeDisabled();
    expect(
      screen.getByText(/every inline button needs a label/i),
    ).toBeInTheDocument();
  });
});
