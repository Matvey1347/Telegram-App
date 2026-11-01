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
import { crmSalesWorkflowApi } from "@/lib/features/growth/crm-sales-workflow-api";
import { copilotKeys } from "@/lib/features/growth/crm-copilot-query";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { CrmCopilot } from "./crm-copilot";
import { useCrmCopilot } from "./use-crm-copilot";
import { copilotContext, copilotDraft } from "./copilot-fixtures.test-support";
const input = {
  category: "SALES_REPLY_SUGGESTION" as const,
  tone: "NATURAL" as const,
  language: "AUTO" as const,
  productIds: [],
  includeNotes: false,
  processingBasis: "APPROVED_BUSINESS_PROCESSING" as const,
  processingReference: "policy:approved",
  sourceAcknowledged: true,
};
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
  vi.spyOn(crmCopilotApi, "context").mockResolvedValue(copilotContext);
  vi.spyOn(crmCopilotApi, "generate").mockResolvedValue(copilotDraft);
  let saved = { ...copilotDraft };
  vi.spyOn(crmCopilotApi, "update").mockImplementation(
    async (_chat, _id, body) => {
      saved = {
        ...saved,
        text: body.text ?? saved.text,
        revision: body.revision + 1,
        status:
          body.action === "APPROVE"
            ? "APPROVED"
            : body.action === "DISCARD"
              ? "DISCARDED"
              : "READY",
      };
      return saved;
    },
  );
  vi.spyOn(crmSalesWorkflowApi, "packages").mockResolvedValue({
    asOf: "2026-10-31",
    products: [],
    networks: [],
    networksTruncated: false,
    discountPolicy: "MANAGER_APPROVAL_REQUIRED",
    nextCursor: null,
    hasMore: false,
  });
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
async function open() {
  fireEvent.click(screen.getByRole("button", { name: /AI Sales Copilot/ }));
  await screen.findByText(
    "No saved AI drafts. Prepare context to create a suggestion.",
  );
}
async function prepare() {
  fireEvent.click(screen.getByText("Настройки генерации"));
  await screen.findByRole("button", { name: "Copilot operation" });
}
describe("opt-in CRM Copilot", () => {
  it("keeps a generation result stale when incoming context changes in flight", async () => {
    let complete!: (value: typeof copilotDraft) => void;
    vi.mocked(crmCopilotApi.generate).mockImplementation(
      () =>
        new Promise((done) => {
          complete = done;
        }),
    );
    const { wrapper, client } = setup();
    const { result } = renderHook(
      () => useCrmCopilot("workspace-one", "chat-one", "client-one"),
      { wrapper },
    );
    act(() => {
      result.current.setOpen(true);
      result.current.setPrepared(true);
    });
    await waitFor(() => expect(result.current.context.isSuccess).toBe(true));
    let request!: Promise<void>;
    act(() => {
      request = result.current.generate(input);
    });
    await waitFor(() =>
      expect(crmCopilotApi.generate).toHaveBeenCalledTimes(1),
    );
    act(() =>
      client.setQueryData(telegramCrmKeys.messagesInfinite("chat-one"), {
        pages: [],
      }),
    );
    await act(async () => {
      complete(copilotDraft);
      await request;
    });
    expect(
      client.getQueryData(copilotKeys.drafts("workspace-one", "chat-one")),
    ).toMatchObject({ items: [{ status: "STALE" }] });
  });

  it("rechecks persisted draft freshness on every explicit reopen without generating", async () => {
    mount();
    await open();
    fireEvent.click(screen.getByRole("button", { name: /AI Sales Copilot/ }));
    fireEvent.click(screen.getByRole("button", { name: /AI Sales Copilot/ }));
    await waitFor(() => expect(crmCopilotApi.list).toHaveBeenCalledTimes(2));
    expect(crmCopilotApi.generate).not.toHaveBeenCalled();
  });

  it("does no AI read or generation on chat selection", () => {
    mount();
    expect(crmCopilotApi.list).not.toHaveBeenCalled();
    expect(crmCopilotApi.context).not.toHaveBeenCalled();
    expect(crmCopilotApi.generate).not.toHaveBeenCalled();
    expect(crmSalesWorkflowApi.packages).not.toHaveBeenCalled();
  });
  it("opens only bounded drafts; prepares context and catalog only on explicit request", async () => {
    mount();
    await open();
    expect(crmCopilotApi.list).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(crmCopilotApi.context).toHaveBeenCalledTimes(1));
    await prepare();
    expect(crmSalesWorkflowApi.packages).toHaveBeenCalledTimes(1);
    expect(crmCopilotApi.generate).not.toHaveBeenCalled();
  });
  it("uses the workspace processing grant without per-chat setup", async () => {
    mount();
    await open();
    await prepare();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Generate suggestion" }),
      ).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate suggestion" }));
    await waitFor(() => expect(crmCopilotApi.generate).toHaveBeenCalledWith(
      "chat-one",
      expect.objectContaining({ processingReference: "policy:approved", sourceAcknowledged: true }),
      expect.anything(),
    ));
  });
  it("explains the default-deny server privacy policy", async () => {
    vi.mocked(crmCopilotApi.context).mockResolvedValue({
      ...copilotContext,
      processingEnabled: false,
      processingReference: null,
      canGenerate: false,
      blockedReason: "PRIVACY_POLICY_DISABLED",
    });
    mount();
    await open();
    await prepare();
    expect(
      await screen.findByText(
        /ИИ недоступен для этого workspace/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Generate suggestion" }),
    ).toBeDisabled();
    expect(screen.queryByText(/INTERNAL_AI_SALES_PROCESSING_GRANTS=/)).toBeNull();
  });
  it("shows a safe access failure without hiding the manual composer elsewhere", async () => {
    vi.mocked(crmCopilotApi.list).mockRejectedValue(
      new Error("private-provider-body"),
    );
    mount();
    fireEvent.click(screen.getByRole("button", { name: /AI Sales Copilot/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Manual messages still work",
    );
    expect(screen.queryByText("private-provider-body")).toBeNull();
  });
  it("requires explicit save and approval before insertion; never sends", async () => {
    vi.mocked(crmCopilotApi.list).mockResolvedValue({ items: [copilotDraft] });
    const { insert } = mount();
    fireEvent.click(screen.getByRole("button", { name: /AI Sales Copilot/ }));
    const edit = await screen.findByRole("textbox", {
      name: "AI suggested message",
    });
    fireEvent.change(edit, { target: { value: "Уточню актуальні умови." } });
    expect(
      screen.getByRole("button", { name: "Approve reviewed text" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save edited draft" }));
    await waitFor(() =>
      expect(crmCopilotApi.update).toHaveBeenCalledWith(
        "chat-one",
        "draft-one",
        { revision: 1, action: "SAVE", text: "Уточню актуальні умови." },
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Approve reviewed text" }),
      ).not.toBeDisabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Approve reviewed text" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Insert approved text" }),
      ).not.toBeDisabled(),
    );
    expect(insert).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Insert approved text" }),
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "APPROVED",
        revision: 3,
        text: "Уточню актуальні умови.",
      }),
    );
  });
  it("shows unknown generation cost and never invents zero", async () => {
    vi.mocked(crmCopilotApi.list).mockResolvedValue({ items: [copilotDraft] });
    mount();
    fireEvent.click(screen.getByRole("button", { name: /AI Sales Copilot/ }));
    expect(await screen.findByText("Unknown · UNKNOWN")).toBeTruthy();
  });
  it("marks a cached draft stale when selected conversation context changes while open", async () => {
    vi.mocked(crmCopilotApi.list).mockResolvedValue({ items: [copilotDraft] });
    const { client } = mount();
    fireEvent.click(screen.getByRole("button", { name: /AI Sales Copilot/ }));
    await screen.findByRole("textbox", { name: "AI suggested message" });
    act(() =>
      client.setQueryData(telegramCrmKeys.salesWorkflow("chat-one"), {
        manualStatus: "DO_NOT_CONTACT",
      }),
    );
    expect(
      await screen.findByText(/Context, status or prices may have changed/),
    ).toBeTruthy();
    expect(crmCopilotApi.generate).not.toHaveBeenCalled();
  });
  it("isolates workspace/conversation keys and selected context options", () => {
    expect(copilotKeys.drafts("one", "chat")).not.toEqual(
      copilotKeys.drafts("two", "chat"),
    );
    expect(copilotKeys.context("one", "chat", ["p"], false)).not.toEqual(
      copilotKeys.context("one", "chat", [], true),
    );
  });
  it("prevents double-tap generation and uses one dated operation ID", async () => {
    let done!: (value: typeof copilotDraft) => void;
    vi.mocked(crmCopilotApi.generate).mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useCrmCopilot("workspace-one", "chat-one", "client-one"),
      { wrapper },
    );
    act(() => {
      result.current.setOpen(true);
      result.current.setPrepared(true);
    });
    await waitFor(() => expect(result.current.context.isSuccess).toBe(true));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.generate(input);
      void result.current.generate(input);
    });
    await waitFor(() =>
      expect(crmCopilotApi.generate).toHaveBeenCalledTimes(1),
    );
    expect(
      vi.mocked(crmCopilotApi.generate).mock.calls[0][1].operationId,
    ).toMatch(/^\d{4}-\d{2}-\d{2}:[a-f0-9-]{36}$/);
    await act(async () => {
      done(copilotDraft);
      await pending;
    });
  });
  it("checks an uncertain operation using the same ID instead of hidden paid retry", async () => {
    vi.mocked(crmCopilotApi.generate)
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue(copilotDraft);
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useCrmCopilot("workspace-one", "chat-one", "client-one"),
      { wrapper },
    );
    act(() => {
      result.current.setOpen(true);
      result.current.setPrepared(true);
    });
    await waitFor(() => expect(result.current.context.isSuccess).toBe(true));
    await act(async () => {
      await result.current.generate(input);
    });
    expect(crmCopilotApi.generate).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.generate(input, true);
    });
    expect(vi.mocked(crmCopilotApi.generate).mock.calls[1][1].operationId).toBe(
      vi.mocked(crmCopilotApi.generate).mock.calls[0][1].operationId,
    );
  });
});
