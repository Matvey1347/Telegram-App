import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiPostingImagesSection } from "./ai-posting-images-section";
import type { AiPostingMediaPreference } from "./ai-posting-media-preferences";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), pushToast: vi.fn(), analyze: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: { post: mocks.analyze },
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
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
      />
    </QueryClientProvider>,
  );
}

describe("AiPostingImagesSection", () => {
  it("accepts one search site URL per line", () => {
    const onImageSearchSources = vi.fn();
    renderSection({ mode: "found", onImageSearchSources });
    const field = screen.getByRole("textbox", { name: "Источники поиска" });
    expect(field).toHaveValue("https://www.pinterest.com/\nhttps://commons.wikimedia.org/");
    fireEvent.change(field, { target: { value: "https://commons.wikimedia.org/\nhttps://photos.example/" } });
    expect(onImageSearchSources).toHaveBeenCalledWith(["https://commons.wikimedia.org/", "https://photos.example/"]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({
      kind: "PHOTO",
      url: "https://media.example/ref.jpg",
      mimeType: "image/jpeg",
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows both hybrid shares and changes the search share by keyboard", async () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const user = userEvent.setup();
    const change = vi.fn();
    renderSection({ mode: "hybrid", onHybridSearchPercent: change });
    const slider = screen.getByRole("slider", { name: "Поиск изображений" });
    expect(slider).toHaveAttribute("aria-valuenow", "80");
    expect(screen.getByText("AI-генерация 20%")).toBeInTheDocument();
    slider.focus();
    await user.keyboard("{ArrowRight}");
    expect(change).toHaveBeenCalledWith(81);
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
      screen.getByLabelText("Общая концепция"),
      "Тёплая палитра",
    );
    await user.type(screen.getByLabelText("Для генерации"), "Мягкий боковой свет");
    await user.click(screen.getByRole("button", { name: "Поиск" }));
    await user.type(screen.getByLabelText("Для поиска"), "Фотография в движении");
    await user.click(
      screen.getByRole("button", { name: "Выбрать эмодзи предпочтения" }),
    );
    await user.click(screen.getByRole("button", { name: "Добавить" }));
    expect(onPreferences).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "Фото",
        description: "Тёплая палитра",
        generationDescription: "Мягкий боковой свет",
        searchDescription: "Фотография в движении",
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

  it("automatically updates both guidance fields after a reference upload", async () => {
    const user = userEvent.setup();
    const onPreferences = vi.fn();
    mocks.analyze.mockResolvedValueOnce({
      data: { generationDescription: "Рассеянный свет", searchDescription: "Искать кадры с плёнки" },
    });
    renderSection({ channelId: "channel-1", onPreferences });
    await user.click(screen.getByRole("button", { name: "Редактировать предпочтение 1" }));
    fireEvent.paste(screen.getByRole("region", { name: "Область референсов для предпочтения" }), {
      clipboardData: { files: [new File(["ref"], "one.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(screen.getByLabelText("Для генерации")).toHaveValue("Рассеянный свет"));
    expect(screen.getByLabelText("Общая концепция")).toHaveValue(preference.description);
    expect(screen.queryByLabelText("Для поиска")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Поиск" }));
    expect(screen.getByLabelText("Для поиска")).toHaveValue("Искать кадры с плёнки");
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    expect(mocks.analyze).toHaveBeenCalledWith(
      "/telegram-channels/channel-1/ai-posting/media-preferences/analyze-references",
      expect.objectContaining({ references: ["https://media.example/ref.jpg"], description: preference.description }),
    );
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onPreferences).toHaveBeenCalledWith([expect.objectContaining({
      generationDescription: "Рассеянный свет",
      searchDescription: "Искать кадры с плёнки",
    })]);
  });

  it("keeps references and previous guidance when analysis fails", async () => {
    const user = userEvent.setup();
    const onPreferences = vi.fn();
    mocks.analyze.mockRejectedValueOnce(new Error("Unavailable"));
    renderSection({
      channelId: "channel-1",
      preferences: [{ ...preference, generationDescription: "Сохранённое описание" }],
      onPreferences,
    });
    await user.click(screen.getByRole("button", { name: "Редактировать предпочтение 1" }));
    fireEvent.paste(screen.getByRole("region", { name: "Область референсов для предпочтения" }), {
      clipboardData: { files: [new File(["ref"], "one.png", { type: "image/png" })] },
    });
    expect(await screen.findByRole("button", { name: "Повторить анализ" })).toBeEnabled();
    expect(screen.getByLabelText("Для генерации")).toHaveValue("Сохранённое описание");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onPreferences).toHaveBeenCalledWith([expect.objectContaining({
      references: ["https://media.example/ref.jpg"],
      generationDescription: "Сохранённое описание",
    })]);
  });

  it("accepts eight reference images and bounds further uploads", async () => {
    const user = userEvent.setup();
    const onPreferences = vi.fn();
    mocks.upload.mockImplementation(async (file: File) => ({ kind: "PHOTO", url: `https://media.example/${file.name}`, mimeType: "image/png" }));
    renderSection({ onPreferences });
    await user.click(screen.getByRole("button", { name: "Редактировать предпочтение 1" }));
    const files = Array.from({ length: 9 }, (_, index) => new File(["ref"], `ref-${index}.png`, { type: "image/png" }));
    fireEvent.paste(screen.getByRole("region", { name: "Область референсов для предпочтения" }), { clipboardData: { files } });
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(8));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onPreferences.mock.calls[0][0][0].references).toHaveLength(8);
  });

  it("rejects references above the upload size limit", async () => {
    const user = userEvent.setup();
    const onPreferences = vi.fn();
    renderSection({ onPreferences });
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", {
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
      "Media files must be 10 MB or smaller.",
      "error",
    );
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(onPreferences).not.toHaveBeenCalled();
  });
});
