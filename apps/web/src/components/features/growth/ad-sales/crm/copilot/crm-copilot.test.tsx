import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { crmCopilotApi } from "@/lib/features/growth/crm-copilot-api";
import { copilotKeys } from "@/lib/features/growth/crm-copilot-query";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { CrmCopilot } from "./crm-copilot";
import { useCrmCopilot } from "./use-crm-copilot";
import { copilotDraft } from "./copilot-fixtures.test-support";
const setup = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
};
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(crmCopilotApi, "list").mockResolvedValue({ items: [] });
  vi.spyOn(crmCopilotApi, "context").mockRejectedValue(
    new Error("No client preparation needed"),
  );
  vi.spyOn(crmCopilotApi, "suggest").mockResolvedValue(copilotDraft);
  vi.spyOn(crmCopilotApi, "update").mockImplementation(
    async (_chat, _id, body) => ({
      ...copilotDraft,
      text: body.text ?? copilotDraft.text,
      revision: body.revision + 1,
      status:
        body.action === "APPROVE"
          ? "APPROVED"
          : body.action === "DISCARD"
            ? "DISCARDED"
            : "READY",
    }),
  );
});
function mount() {
  const { wrapper, client } = setup();
  const insert = vi.fn();
  return {
    ...render(
      <CrmCopilot
        workspaceId="workspace-one"
        conversationId="chat-one"
        contactId="client-one"
        canSend
        onInsert={insert}
      />,
      { wrapper },
    ),
    insert,
    client,
  };
}
const generate = () =>
  fireEvent.click(screen.getByRole("button", { name: "Сгенерировать ответ" }));
describe("compact one-click CRM suggestions", () => {
  it("does no AI reads or generation merely on chat selection", () => {
    mount();
    expect(crmCopilotApi.list).not.toHaveBeenCalled();
    expect(crmCopilotApi.context).not.toHaveBeenCalled();
    expect(crmCopilotApi.suggest).not.toHaveBeenCalled();
    expect(screen.queryByText("Настройки генерации")).not.toBeInTheDocument();
  });
  it("generates a personalized draft with one click and no local setup", async () => {
    mount();
    generate();
    expect(
      await screen.findByRole("textbox", { name: "AI suggested message" }),
    ).toHaveValue(copilotDraft.text);
    expect(crmCopilotApi.suggest).toHaveBeenCalledWith(
      "chat-one",
      {
        operationId: expect.stringMatching(/^\d{4}-\d{2}-\d{2}:[a-f0-9-]{36}$/),
      },
      expect.any(AbortSignal),
    );
    expect(crmCopilotApi.context).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        /revision|NO_SELECTED_VERIFIED_PRODUCTS|Настройки генерации/,
      ),
    ).not.toBeInTheDocument();
  });
  it("aborts an in-flight request when the panel is closed", async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(crmCopilotApi.suggest).mockImplementation((_chat, _body, currentSignal) => {
      signal = currentSignal;
      return new Promise((_resolve, reject) => currentSignal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    });
    mount();
    generate();
    await waitFor(() => expect(signal).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Скрыть ответ ИИ" }));
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Сгенерировать ответ" })).not.toBeDisabled());
  });
  it("approves the reviewed edited text and inserts it without sending", async () => {
    const { insert } = mount();
    generate();
    fireEvent.change(
      await screen.findByRole("textbox", { name: "AI suggested message" }),
      { target: { value: "Уточню актуальні умови." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Использовать" }));
    await waitFor(() =>
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "APPROVED",
          revision: 2,
          text: "Уточню актуальні умови.",
        }),
      ),
    );
    expect(crmCopilotApi.update).toHaveBeenCalledWith("chat-one", "draft-one", {
      revision: 1,
      action: "APPROVE",
      text: "Уточню актуальні умови.",
    });
  });
  it("persists negative feedback and closes the large text editor", async () => {
    mount();
    generate();
    await screen.findByRole("textbox", { name: "AI suggested message" });
    fireEvent.click(screen.getByRole("button", { name: "Не подходит" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Что не так с ответом" }), { target: { value: "Учти бюджет клиента" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить замечание" }));
    expect(await screen.findByText(/Учтём эту оценку/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(crmCopilotApi.update).toHaveBeenCalledWith("chat-one", "draft-one", {
      revision: 1,
      action: "DISCARD",
      text: "[MANAGER_FEEDBACK] Учти бюджет клиента",
    });
  });
  it("turns FAILED into an actionable error rather than an empty editor", async () => {
    vi.mocked(crmCopilotApi.suggest).mockResolvedValue({
      ...copilotDraft,
      status: "FAILED",
      text: "",
      canEdit: false,
      output: null,
      warnings: ["PROVIDER_AUTH_FAILED"],
    });
    mount();
    generate();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "проверить ключ сервиса",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("PROVIDER_AUTH_FAILED")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Сгенерировать ответ" }),
    ).not.toBeDisabled();
  });
  it("never inserts an answer if current authorization or facts reject approval", async () => {
    vi.mocked(crmCopilotApi.update).mockRejectedValue(
      new Error("COPILOT_CONTEXT_STALE"),
    );
    const { insert } = mount();
    generate();
    await screen.findByRole("textbox", { name: "AI suggested message" });
    fireEvent.click(screen.getByRole("button", { name: "Использовать" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "изменились переписка",
    );
    expect(insert).not.toHaveBeenCalled();
  });
  it("keeps generation stale when messages change during the provider call", async () => {
    let finish!: (value: typeof copilotDraft) => void;
    vi.mocked(crmCopilotApi.suggest).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { client } = mount();
    generate();
    await waitFor(() => expect(crmCopilotApi.suggest).toHaveBeenCalledTimes(1));
    act(() =>
      client.setQueryData(telegramCrmKeys.messagesInfinite("chat-one"), {
        pages: [],
      }),
    );
    await act(async () => finish(copilotDraft));
    expect(
      await screen.findByText(/Переписка или условия изменились/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Использовать" })).toBeDisabled();
  });
  it("guards double taps and checks uncertainty with the same operation ID", async () => {
    vi.mocked(crmCopilotApi.suggest)
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValue(copilotDraft);
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useCrmCopilot("workspace-one", "chat-one", "client-one"),
      { wrapper },
    );
    await act(async () => {
      const request = result.current.generate();
      void result.current.generate();
      await request;
    });
    expect(crmCopilotApi.suggest).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.generate(true);
    });
    expect(vi.mocked(crmCopilotApi.suggest).mock.calls[0][1]).toEqual(
      vi.mocked(crmCopilotApi.suggest).mock.calls[1][1],
    );
  });
  it.each(["UNKNOWN", "GENERATING"] as const)(
    "closing a saved %s result keeps the main action read-only",
    async (status) => {
      const unresolved = {
        ...copilotDraft,
        status,
        text: "",
        canEdit: false,
        output: null,
      };
      vi.mocked(crmCopilotApi.suggest).mockResolvedValue(unresolved);
      vi.mocked(crmCopilotApi.list).mockResolvedValue({ items: [unresolved] });
      mount();
      generate();
      await screen.findByText(/Ответ ещё готовится/);
      fireEvent.click(screen.getByRole("button", { name: "Скрыть ответ ИИ" }));
      expect(
        screen.getByText(/Результат предыдущего запроса/),
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: "Проверить генерацию" }),
      );
      await screen.findByText(/Ответ ещё готовится/);
      expect(crmCopilotApi.suggest).toHaveBeenCalledTimes(1);
      expect(crmCopilotApi.list).toHaveBeenCalledTimes(2);
    },
  );
  it("closing a transport failure preserves the same-operation recovery action", async () => {
    vi.mocked(crmCopilotApi.suggest)
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValue(copilotDraft);
    mount();
    generate();
    await screen.findByText(/Не удалось получить результат запроса/);
    const original = vi.mocked(crmCopilotApi.suggest).mock.calls[0][1]
      .operationId;
    fireEvent.click(screen.getByRole("button", { name: "Скрыть ответ ИИ" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Проверить генерацию" }),
    );
    expect(
      await screen.findByRole("textbox", { name: "AI suggested message" }),
    ).toHaveValue(copilotDraft.text);
    expect(crmCopilotApi.suggest).toHaveBeenCalledTimes(2);
    expect(vi.mocked(crmCopilotApi.suggest).mock.calls[1][1].operationId).toBe(
      original,
    );
  });
  it("explains pricing review while keeping the text editable and requiring explicit approval", async () => {
    vi.mocked(crmCopilotApi.suggest).mockResolvedValue({
      ...copilotDraft,
      status: "REVIEW_REQUIRED",
      text: "Пакет по ранее названной сумме.",
      warnings: ["UNVERIFIED_FINANCIAL_ASSERTION"],
    });
    const { insert } = mount();
    generate();
    const editor = await screen.findByRole("textbox", {
      name: "AI suggested message",
    });
    expect(
      await screen.findByText(/Проверьте цену и условия/),
    ).toHaveTextContent("неподтверждённые суммы нужно убрать или уточнить");
    expect(editor).not.toBeDisabled();
    fireEvent.change(editor, {
      target: { value: "Уточню актуальные условия полного пакета." },
    });
    expect(crmCopilotApi.update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(
      screen.queryByText("UNVERIFIED_FINANCIAL_ASSERTION"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Использовать" }));
    await waitFor(() =>
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "APPROVED",
          text: "Уточню актуальные условия полного пакета.",
        }),
      ),
    );
  });
  it("adopts an existing operation returned by the server race fence for recovery", async () => {
    vi.mocked(crmCopilotApi.suggest).mockResolvedValue({
      ...copilotDraft,
      status: "UNKNOWN",
      text: "",
      canEdit: false,
    });
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useCrmCopilot("workspace-one", "chat-one", "client-one"),
      { wrapper },
    );
    await act(async () => {
      await result.current.generate();
    });
    await act(async () => {
      await result.current.generate(true);
    });
    expect(vi.mocked(crmCopilotApi.suggest).mock.calls[1][1].operationId).toBe(
      copilotDraft.operationId,
    );
  });
  it("isolates workspace/conversation draft caches", () => {
    expect(copilotKeys.drafts("one", "chat")).not.toEqual(
      copilotKeys.drafts("two", "chat"),
    );
  });
});
