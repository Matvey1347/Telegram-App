import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorkspaceCreative } from "@telegram-system/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceCreativesApi } from "@/lib/features/workspace/workspace-creatives-api";
import { I18nProvider } from "@/providers/i18n-provider";
import { authApi, telegramSystemBotApi } from "@/lib/api";
import { creativeLabels } from "./creative-labels";
import { loadCreativeEncyclopediaText } from "./creative-copy";
import { CreativeEncyclopedia } from "./creative-encyclopedia";

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));

const locale = creativeLabels("ru");
const workspaceId = "design-team";
const createAttempt = (
  details: Partial<WorkspaceCreative> = {},
): WorkspaceCreative => ({
  id: "draft-1",
  title: "Первый вариант",
  section: "attempt",
  target: "channel",
  text: "Подписка на дайджест",
  sourceUrl: null,
  attachment: null,
  comments: [],
  ...details,
});

afterEach(() => vi.restoreAllMocks());

describe("creative encyclopedia", () => {
  it("copies the entire encyclopedia from the button and shows the text if clipboard access fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(workspaceCreativesApi, "list").mockImplementation((_id, section) =>
      Promise.resolve({
        items: section === "attempt" ? [createAttempt()] : [],
        nextCursor: null,
      }),
    );
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValue(new Error("Clipboard blocked"));
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <CreativeEncyclopedia
          workspaceId={workspaceId}
          linkedId={null}
          labels={locale}
          onClose={vi.fn()}
          onBack={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: locale.copy }));
    const fallback = await screen.findByRole("textbox", {
      name: locale.copyFallback,
    });
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(createAttempt().text),
    );
    expect((fallback as HTMLTextAreaElement).value).toContain(
      createAttempt().text,
    );
    expect(fallback).toHaveFocus();
  });

  it("adds and copies standalone mentor advice", async () => {
    const user = userEvent.setup();
    const advice = createAttempt({ section: "mentor", target: null, title: "Первый экран", text: "Покажите пользу сразу." });
    const connection = vi.spyOn(telegramSystemBotApi, "connection");
    vi.spyOn(workspaceCreativesApi, "list").mockImplementation((_workspace, section) =>
      Promise.resolve({ items: section === "mentor" ? [advice] : [], nextCursor: null }),
    );
    const create = vi.spyOn(workspaceCreativesApi, "create").mockResolvedValue(advice);
    vi.spyOn(authApi, "me").mockResolvedValue({ user: {} } as never);
    render(<QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale="ru">
        <CreativeEncyclopedia workspaceId={workspaceId} linkedId={null} labels={locale} onClose={vi.fn()} onBack={vi.fn()} />
      </I18nProvider>
    </QueryClientProvider>);
    await user.click(screen.getByRole("button", { name: locale.sections.mentor }));
    await user.click(screen.getByRole("button", { name: locale.addAdvice }));
    await user.type(screen.getByLabelText(locale.entryTitle), advice.title);
    await user.type(screen.getByLabelText(locale.adviceText), advice.text);
    await user.click(screen.getByRole("button", { name: locale.saveAdvice }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(workspaceId, {
      section: "mentor", title: advice.title, text: advice.text,
    }, null));
    expect(connection).not.toHaveBeenCalled();
    const copied = await loadCreativeEncyclopediaText(workspaceId, locale, "https://example.test", new AbortController().signal);
    expect(copied).toContain(locale.sections.mentor);
    expect(copied).toContain(advice.text);
  });

  it("saves a creative in the selected section and appends mentor feedback", async () => {
    const attempt = createAttempt({
      comments: [{ id: "1", text: "Поменять заголовок" }],
    });
    const user = userEvent.setup();
    const list = vi
      .spyOn(workspaceCreativesApi, "list")
      .mockResolvedValue({ items: [], nextCursor: null });
    const save = vi
      .spyOn(workspaceCreativesApi, "create")
      .mockResolvedValue(attempt);
    vi.spyOn(workspaceCreativesApi, "comment").mockResolvedValue({
      id: "2",
      text: "Показать пользу в первом абзаце",
    });
    vi.spyOn(authApi, "me").mockResolvedValue({ user: {} } as never);
    vi.spyOn(telegramSystemBotApi, "connection").mockRejectedValue(
      new Error("Disconnected"),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <I18nProvider initialLocale="ru">
          <CreativeEncyclopedia
            workspaceId={workspaceId}
            linkedId={null}
            labels={locale}
            onClose={vi.fn()}
            onBack={vi.fn()}
          />
        </I18nProvider>
      </QueryClientProvider>,
    );
    const dialog = within(
      await screen.findByRole("dialog", { name: locale.title }),
    );
    expect(await dialog.findByText(locale.empty)).toBeVisible();
    await user.click(
      dialog.getByRole("button", { name: locale.sections.attempt }),
    );
    await user.click(dialog.getByRole("button", { name: locale.add }));
    await user.type(dialog.getByLabelText(locale.entryTitle), attempt.title);
    await user.type(
      dialog.getByPlaceholderText(locale.entryText),
      attempt.text,
    );
    await user.type(
      dialog.getByLabelText(locale.comment),
      attempt.comments[0].text,
    );
    await user.click(dialog.getByRole("button", { name: locale.save }));
    const entry = within(
      await dialog.findByRole("article", { name: attempt.title }),
    );
    expect(entry.getByText(attempt.comments[0].text)).toBeVisible();
    expect(save).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({
        section: "attempt",
        target: "channel",
        post: expect.objectContaining({ text: attempt.text }),
      }),
      null,
    );

    await user.click(entry.getByRole("button", { name: locale.addComment }));
    await user.type(
      entry.getByRole("textbox", { name: locale.addComment }),
      "Показать пользу в первом абзаце",
    );
    await user.click(entry.getByRole("button", { name: locale.addComment }));
    expect(
      await entry.findByText("Показать пользу в первом абзаце"),
    ).toBeVisible();
    expect(entry.getAllByRole("listitem")).toHaveLength(2);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("keeps the unfinished post when returning to the encyclopedia", async () => {
    const user = userEvent.setup();
    const draftTitle = "Креатив для відновлення";
    vi.spyOn(authApi, "me").mockResolvedValue({ user: {} } as never);
    vi.spyOn(telegramSystemBotApi, "connection").mockResolvedValue({
      connected: false,
    } as never);
    vi.spyOn(workspaceCreativesApi, "list").mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <I18nProvider initialLocale="ru">
          <CreativeEncyclopedia
            workspaceId="creative-resume-team"
            linkedId={null}
            labels={locale}
            onClose={vi.fn()}
            onBack={vi.fn()}
          />
        </I18nProvider>
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: locale.add }));
    expect(screen.queryByLabelText("Ссылка на источник")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(locale.entryTitle), draftTitle);
    await user.type(
      screen.getByLabelText(locale.comment),
      "Зберегти для допрацювання",
    );
    await user.click(screen.getByRole("button", { name: locale.back }));
    await user.click(screen.getByRole("button", { name: locale.add }));
    await user.click(
      await screen.findByRole("button", {
        name: `Continue draft ${draftTitle}`,
      }),
    );
    expect(screen.getByLabelText(locale.entryTitle)).toHaveValue(draftTitle);
    expect(screen.getByLabelText(locale.comment)).toHaveValue(
      "Зберегти для допрацювання",
    );
  });

  it("imports a formatted post through the shared single-post flow", async () => {
    const user = userEvent.setup();
    const imported = {
      title: "Промо из Telegram",
      text: "**Готовый креатив**",
      imageUrls: ["https://example.test/promo.jpg"],
      buttonRows: [
        [
          {
            text: "Открыть",
            url: "https://example.test/",
            style: "primary" as const,
          },
        ],
      ],
    };
    vi.spyOn(authApi, "me").mockResolvedValue({ user: {} } as never);
    vi.spyOn(telegramSystemBotApi, "connection").mockResolvedValue({
      connected: true,
      botUsername: "example_bot",
    } as never);
    const start = vi
      .spyOn(telegramSystemBotApi, "startPostImport")
      .mockResolvedValue({
        workflowId: "creative-workflow",
        mode: "single",
      } as never);
    vi.spyOn(telegramSystemBotApi, "readPostImport").mockResolvedValue({
      workflowId: "creative-workflow",
      status: "COMPLETED",
      ready: true,
      mode: "single",
      drafts: [imported],
    } as never);
    vi.spyOn(workspaceCreativesApi, "list").mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    const save = vi
      .spyOn(workspaceCreativesApi, "create")
      .mockResolvedValue(createAttempt());
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider initialLocale="ru">
          <CreativeEncyclopedia
            workspaceId={workspaceId}
            linkedId={null}
            labels={locale}
            onClose={vi.fn()}
            onBack={vi.fn()}
          />
        </I18nProvider>
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: locale.add }));
    const importButton = await screen.findByRole("button", {
      name: locale.importPost,
    });
    await waitFor(() => expect(importButton).toBeEnabled());
    await user.click(importButton);
    expect(start).toHaveBeenCalledWith({
      mode: "single",
      context: locale.title,
    });
    expect(
      await screen.findByDisplayValue(imported.title, {}, { timeout: 3500 }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: locale.save }));
    expect(save).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({
        title: imported.title,
        post: expect.objectContaining({
          text: imported.text,
          imageUrls: imported.imageUrls,
          buttonRows: imported.buttonRows,
        }),
      }),
      null,
    );
  });

  it("copies every section and page with type, original content, files and all comments", async () => {
    const list = vi
      .spyOn(workspaceCreativesApi, "list")
      .mockImplementation(async (_id, section, cursor) => {
        if (section === "good" && !cursor)
          return {
            items: [
              createAttempt({
                id: "first",
                section,
                title: "Пример ментора",
                target: "externalProduct",
                sourceUrl: "https://source.example/creative",
              }),
            ],
            nextCursor: "first",
          };
        if (section === "good")
          return {
            items: [
              createAttempt({
                id: "next",
                section,
                title: "Следующая страница",
              }),
            ],
            nextCursor: null,
          };
        const entry =
          section === "bad"
            ? createAttempt({ id: "bad", section, title: "Неудачный пример" })
            : createAttempt({
                attachment: { name: "creative.mp4", mimeType: "video/mp4" },
                comments: [
                  { id: "1", text: "Сократить" },
                  { id: "2", text: "Уточнить" },
                ],
              });
        return { items: [entry], nextCursor: null };
      });
    const result = await loadCreativeEncyclopediaText(
      workspaceId,
      locale,
      "https://example.com",
      new AbortController().signal,
    );
    expect(result).not.toContain("https://source.example/creative");
    for (const value of [
      locale.sections.good,
      locale.sections.bad,
      locale.sections.attempt,
      locale.targets.externalProduct,
      locale.targets.channel,
      "Пример ментора",
      "Следующая страница",
      "Неудачный пример",
      "Первый вариант",
      "creative.mp4",
      "https://example.com/ad-campaigns?section=promo#creative=draft-1&workspace=design-team",
      "1. Сократить",
      "2. Уточнить",
    ])
      expect(result).toContain(value);
    expect(
      list.mock.calls.map(([, section, cursor]) => [section, cursor]),
    ).toContainEqual(["good", "first"]);
  });
});
