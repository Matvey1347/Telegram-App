import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiPostingImagesSection } from "./ai-posting-images-section";
import type { AiPostingMediaPreference } from "./ai-posting-media-preferences";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), pushToast: vi.fn() }));
vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { uploadManagedPostMedia: mocks.upload },
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: mocks.pushToast }),
}));
vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: ({
    onChange,
    disabled,
    iconId,
    icon,
    ariaLabel,
  }: {
    onChange: (
      id: string | null,
      icon: { type: "unicode"; value: string },
    ) => void;
    disabled?: boolean;
    iconId?: string;
    icon?: { type: "unicode"; value: string };
    ariaLabel?: string;
  }) => (
    <button
      type="button"
      aria-label={ariaLabel ?? "Choose emoji"}
      disabled={disabled}
      onClick={() =>
        onChange("premium-emoji-id", { type: "unicode", value: "💠" })
      }
    >
      {iconId ? "💠" : (icon?.value ?? "🎨")}
    </button>
  ),
}));

const preference: AiPostingMediaPreference = {
  id: "style-1",
  name: "Рисованные схемы",
  description: "Сдержанная палитра",
  emoji: "📊",
  references: [],
};

function renderSection(
  overrides: Partial<Parameters<typeof AiPostingImagesSection>[0]> = {},
) {
  return render(
    <AiPostingImagesSection
      mode="ai"
      preferences={[preference]}
      avoidances={[]}
      channelAvatarUrl="https://media.example/channel.jpg"
      useChannelAvatarInMedia={false}
      onMode={vi.fn()}
      onPreferences={vi.fn()}
      onAvoidances={vi.fn()}
      onUseChannelAvatarInMedia={vi.fn()}
      {...overrides}
    />,
  );
}

describe("AiPostingImagesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({
      kind: "PHOTO",
      url: "https://media.example/ref.jpg",
      mimeType: "image/jpeg",
    });
  });

  it("adds a named preference with the shared emoji picker", async () => {
    const user = userEvent.setup();
    const onPreferences = vi.fn();
    renderSection({ preferences: [], onPreferences });
    await user.click(
      screen.getByRole("button", { name: "Добавить предпочтение" }),
    );
    await user.type(screen.getByLabelText("Название предпочтения"), "Фото");
    await user.type(
      screen.getByLabelText("Описание предпочтения"),
      "Тёплая палитра",
    );
    await user.click(
      screen.getByRole("button", { name: "Выбрать эмодзи предпочтения" }),
    );
    await user.click(screen.getByRole("button", { name: "Добавить" }));
    expect(onPreferences).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "Фото",
        description: "Тёплая палитра",
        emoji: "💠",
        emojiIconId: "premium-emoji-id",
        references: [],
      }),
    ]);
  });

  it("uploads a reference into its preference and preserves the avatar toggle", async () => {
    const user = userEvent.setup();
    const onPreferences = vi.fn();
    const onUseChannelAvatarInMedia = vi.fn();
    renderSection({ onPreferences, onUseChannelAvatarInMedia });
    await user.click(
      screen.getByRole("button", { name: "Редактировать предпочтение 1" }),
    );
    const file = new File(["reference"], "style.png", { type: "image/png" });
    fireEvent.paste(
      screen.getByRole("region", {
        name: "Область референсов для предпочтения",
      }),
      { clipboardData: { files: [file] } },
    );
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith(file));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(onPreferences).toHaveBeenCalledWith([
        { ...preference, references: ["https://media.example/ref.jpg"] },
      ]),
    );
    await user.click(
      screen.getByRole("button", { name: "Добавлять аватар канала на медиа" }),
    );
    expect(onUseChannelAvatarInMedia).toHaveBeenCalledWith(true);
  });

  it("rejects references above the upload size limit", async () => {
    const user = userEvent.setup();
    const onPreferences = vi.fn();
    renderSection({ onPreferences });
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", {
      type: "image/png",
    });
    await user.click(
      screen.getByRole("button", { name: "Редактировать предпочтение 1" }),
    );
    fireEvent.paste(
      screen.getByRole("region", {
        name: "Область референсов для предпочтения",
      }),
      { clipboardData: { files: [file] } },
    );
    expect(mocks.pushToast).toHaveBeenCalledWith(
      "Media files must be 2 MB or smaller.",
      "error",
    );
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(onPreferences).not.toHaveBeenCalled();
  });
});
