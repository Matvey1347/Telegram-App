import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { api } from "@/lib/api";
import { I18nProvider } from "@/providers/i18n-provider";
import importRu from "@/i18n/locales/ru/telegram/posts/import";
import { renderWithI18n } from "@/test/render-with-i18n";
import { AiPostingSettingsTransfer } from "./ai-posting-settings-transfer";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
function renderTransfer(props: React.ComponentProps<typeof AiPostingSettingsTransfer>) {
  return render(
    <I18nProvider initialLocale="ru" preloadedCatalogs={{ "telegram/posts/import": importRu }}>
      <AiPostingSettingsTransfer {...props} />
    </I18nProvider>,
  );
}

describe("AiPostingSettingsTransfer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("imports pasted AI configuration directly from the tab and shows the server report", async () => {
    const onImported = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.post).mockResolvedValue({ data: { report: { applied: [{ id: "idea", label: "Идея канала", status: "applied", message: "Идея канала: обновлено." }], ignoredFields: [] } } } as never);
    const user = userEvent.setup();
    renderTransfer({ channelId: "channel-1", configuration: { topic: "Draft" }, onImported });

    const input = screen.getByRole("textbox", { name: "Данные для импорта" });
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "Выбрать файл" })).toBeVisible();
    await user.click(input);
    await user.paste('```json\n{"schemaVersion":2,"configuration":{"topic":"New idea"}}\n```');
    fireEvent.click(screen.getByRole("button", { name: "Применить настройки" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/telegram-channels/channel-1/ai-posting/settings/import",
      { schemaVersion: 2, configuration: { topic: "New idea" } },
    ));
    await waitFor(() => expect(onImported).toHaveBeenCalledOnce());
    expect(await screen.findByText("Идея канала: обновлено.")).toBeInTheDocument();
    expect(screen.getByText("Импорт завершён. Настройки канала обновлены.")).toBeInTheDocument();
  });

  it("loads a dropped JSON file into the editable field and uses English labels", async () => {
    renderWithI18n(<AiPostingSettingsTransfer channelId="channel-1" configuration={{}} onImported={vi.fn()} />);
    const json = '{"topic":"From a file"}';
    const file = new File([json], "settings.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(json) });
    expect(screen.getByRole("heading", { name: "Import / export settings" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Apply settings" })).toBeDisabled();

    fireEvent.drop(screen.getByRole("region"), { dataTransfer: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Import data" })).toHaveValue(json));
    expect(screen.getByText("settings.json")).toBeVisible();
    expect(screen.getByRole("button", { name: "Apply settings" })).toBeEnabled();
  });

  it("rejects invalid pasted content without sending it to the server", async () => {
    renderTransfer({ channelId: "channel-1", configuration: {}, onImported: vi.fn() });
    fireEvent.change(screen.getByRole("textbox", { name: "Данные для импорта" }), { target: { value: "not json" } });
    fireEvent.click(screen.getByRole("button", { name: "Применить настройки" }));
    expect(await screen.findByText(/Формат не распознан/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("explains media preference validation failures", async () => {
    vi.mocked(api.post).mockRejectedValue({
      response: { data: { message: "AI_POSTING_MEDIA_PREFERENCES_INVALID" } },
    });
    renderTransfer({ channelId: "channel-1", configuration: {}, onImported: vi.fn() });
    fireEvent.change(screen.getByRole("textbox", { name: "Данные для импорта" }), {
      target: { value: '{"configuration":{"mediaPreferences":[{}]}}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Применить настройки" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("не более 30 предпочтений");
  });

  it("copies the instruction as readable text and current context without inline image data", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.mocked(api.get).mockResolvedValue({ data: {
      schemaVersion: 2,
      instruction: "# AI Posting guide\n\nConfigure the channel and return a full JSON object.",
      channel: { title: "Test", photoUrl: "data:image/jpeg;base64,large-avatar" },
      schema: { audience: "string" },
      fieldGuide: { audience: "Who the channel is for" },
    } } as never);
    const liveConfiguration = { topic: "Unsaved current idea", mediaPreferences: [{ references: ["data:image/png;base64,inline"] }] };
    renderTransfer({ channelId: "channel-1", configuration: liveConfiguration, onImported: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "Скопировать инструкцию и контекст" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain("# AI Posting guide");
    expect(copied).toContain("## Текущий контекст и настройки канала");
    expect(copied).toContain('"topic": "Unsaved current idea"');
    expect(copied).toContain('"audience": "Who the channel is for"');
    expect(copied).not.toContain("data:image");
    expect(copied).not.toContain("large-avatar");
    expect(await screen.findByRole("button", { name: "Скопировано" })).toBeInTheDocument();
  });
});
