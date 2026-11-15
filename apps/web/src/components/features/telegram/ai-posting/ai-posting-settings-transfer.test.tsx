import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { AiPostingSettingsTransfer } from "./ai-posting-settings-transfer";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../telegram/managed-posts-import-source", () => ({
  ManagedPostsImportSource: ({ content, onContent, onFile, disabled }: { content: string; onContent: (value: string) => void; onFile: (file: File) => void; disabled: boolean }) => <div>
    <textarea aria-label="Данные для импорта" value={content} disabled={disabled} onChange={(event) => onContent(event.target.value)}/>
    <input aria-label="Выбрать файл" type="file" disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); }}/>
  </div>,
}));

describe("AiPostingSettingsTransfer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("imports pasted AI configuration directly from the tab and shows the server report", async () => {
    const onImported = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.post).mockResolvedValue({ data: { report: { applied: [{ id: "idea", label: "Идея канала", status: "applied", message: "Идея канала: обновлено." }], ignoredFields: [] } } } as never);
    render(<AiPostingSettingsTransfer channelId="channel-1" configuration={{ topic: "Draft" }} onImported={onImported}/>);

    fireEvent.change(screen.getByRole("textbox", { name: "Данные для импорта" }), { target: { value: JSON.stringify({ schemaVersion: 2, configuration: { topic: "New idea" } }) } });
    fireEvent.click(screen.getByRole("button", { name: "Применить настройки" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/telegram-channels/channel-1/ai-posting/settings/import",
      { schemaVersion: 2, configuration: { topic: "New idea" } },
    ));
    await waitFor(() => expect(onImported).toHaveBeenCalledOnce());
    expect(await screen.findByText("Идея канала: обновлено.")).toBeInTheDocument();
    expect(screen.getByText("Импорт завершён. Настройки канала обновлены.")).toBeInTheDocument();
  });

  it("rejects invalid pasted content without sending it to the server", async () => {
    render(<AiPostingSettingsTransfer channelId="channel-1" configuration={{}} onImported={vi.fn()}/>);
    fireEvent.change(screen.getByRole("textbox", { name: "Данные для импорта" }), { target: { value: "not json" } });
    fireEvent.click(screen.getByRole("button", { name: "Применить настройки" }));
    expect(await screen.findByText(/Формат не распознан/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
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
    render(<AiPostingSettingsTransfer channelId="channel-1" configuration={liveConfiguration} onImported={vi.fn()}/>);
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
