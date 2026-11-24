import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroshlyApp } from "@finance-web/groshly/main";
import { initial } from "@finance-web/groshly/data";

const { message, chat, chats, turns, createChat, renameChat, moveChat, deleteChat } = vi.hoisted(() => ({
  message: vi.fn(), chat: vi.fn(), chats: vi.fn(), turns: vi.fn(), createChat: vi.fn(), renameChat: vi.fn(), moveChat: vi.fn(), deleteChat: vi.fn(),
}));
vi.mock("@consumer-finance/web/lib/api/consumer-finance-assistant-api", () => ({
  consumerFinanceAssistantApi: { message, chat, chats, turns, createChat, renameChat, moveChat, deleteChat },
  FinanceAssistantRequestError: Error,
}));
const entitlement = vi.hoisted(() => ({ remaining: null as number | null }));
vi.mock(
  "@consumer-finance/web/components/hooks/use-finance-entitlements",
  () => ({
    useFinanceEntitlements: () => ({
      data: {
        tier: entitlement.remaining === 0 ? "FREE" : "PRO",
        capabilities: entitlement.remaining === 0 ? [] : ["VOICE_INPUT"],
        usage: [
          {
            feature: "AI_INPUT",
            remaining: entitlement.remaining,
            limit: entitlement.remaining,
          },
        ],
      },
      refetch: vi.fn(),
    }),
  }),
);
const App = GroshlyApp as ComponentType<{
  initialData: ReturnType<typeof initial>;
  previewScreen: string;
  financeBotId: string;
  assistantProfileId: string;
  telegramAuthenticated: boolean;
}>;

function openPage() {
  const data = { ...initial(), onboarded: true, lang: "en" };
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <App
        initialData={data}
        previewScreen="ai"
        financeBotId="fixture-bot"
        assistantProfileId="fixture-profile"
        telegramAuthenticated
      />
    </QueryClientProvider>,
  );
}

function mockSpeechRecognition() {
  const sessions: SpeechRecognitionMock[] = [];

  class SpeechRecognitionMock {
    lang = "";
    continuous = false;
    interimResults = false;
    onresult: ((event: { results: { transcript: string }[][] }) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    start = vi.fn();
    stop = vi.fn();
    abort = vi.fn();

    constructor() {
      sessions.push(this);
    }

    result(...phrases: string[]) {
      this.onresult?.({ results: phrases.map((transcript) => [{ transcript }]) });
    }
  }

  vi.stubGlobal("SpeechRecognition", undefined);
  vi.stubGlobal("webkitSpeechRecognition", SpeechRecognitionMock);
  return sessions;
}

describe("Groshly AI", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    entitlement.remaining = null;
    window.history.replaceState(null, "", "/app/ai");
    vi.resetAllMocks();
    chats.mockResolvedValue({ items: [{ id: "general", title: "Daily", mode: "GENERAL" }], nextCursor: null });
    createChat.mockResolvedValue({ id: "new-chat", title: "New chat", mode: "GENERAL" });
    turns.mockResolvedValue({ items: [], nextCursor: null });
    message.mockResolvedValue({
      kind: "ANSWER",
      message: "Hello from Groshly AI.",
    });
  });
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
  });

  it("shows live dictation and sends only the transcript the user edited", async () => {
    const sessions = mockSpeechRecognition();
    openPage();
    const composer = await screen.findByRole("textbox", { name: "Write a message…" }, { timeout: 3000 });
    const send = screen.getByRole("button", { name: "Send" });
    fireEvent.change(composer, { target: { value: "Yesterday:" } });
    fireEvent.click(screen.getByRole("button", { name: "Dictate a message" }));
    const [recognition] = sessions;
    expect(recognition).toMatchObject({ lang: "en-US", continuous: true, interimResults: true });
    expect(recognition.start).toHaveBeenCalledOnce();
    act(() => recognition.result("coffee", "ten"));
    expect(composer).toHaveValue("Yesterday: coffee ten");
    act(() => recognition.result("coffee", "twenty"));
    expect(composer).toHaveValue("Yesterday: coffee twenty");
    expect(send).toBeEnabled();
    expect(screen.getByRole("status", { name: "Microphone active" })).toBeVisible();
    expect(screen.queryByText("Listening…")).not.toBeInTheDocument();
    expect(message).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Keep dictation in draft" }));
    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(send).toBeDisabled();
    act(() => {
      recognition.result("Coffee", "twenty złoty.");
      recognition.onend?.();
    });
    expect(composer).toHaveValue("Yesterday: Coffee twenty złoty.");
    expect(composer).not.toHaveAttribute("readonly");
    expect(screen.queryByLabelText(/Remove attachment/)).not.toBeInTheDocument();
    expect(message).not.toHaveBeenCalled();
    fireEvent.change(composer, { target: { value: "Yesterday I spent 22 zł on coffee." } });
    fireEvent.click(send);
    await waitFor(() =>
      expect(message).toHaveBeenCalledWith(
        "fixture-bot",
        expect.objectContaining({ text: "Yesterday I spent 22 zł on coffee." }),
        expect.anything(),
      ),
    );
  });

  it.each(["send button", "Enter"])("submits the final dictation directly using %s", async (action) => {
    const sessions = mockSpeechRecognition();
    openPage();
    const composer = await screen.findByRole("textbox", { name: "Write a message…" });
    fireEvent.change(composer, { target: { value: "Budget:" } });
    fireEvent.click(screen.getByRole("button", { name: "Dictate a message" }));
    const [recognition] = sessions;
    act(() => recognition.result("twenty"));
    const submit = () => action === "Enter"
      ? fireEvent.keyDown(composer, { key: "Enter" })
      : fireEvent.click(screen.getByRole("button", { name: "Send" }));
    submit();
    submit();
    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(message).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    act(() => {
      recognition.result("twenty złoty for coffee.");
      recognition.onend?.();
    });
    await waitFor(() => expect(message).toHaveBeenCalledOnce());
    expect(message).toHaveBeenCalledWith("fixture-bot", expect.objectContaining({
      text: "Budget: twenty złoty for coffee.",
    }), expect.anything());
    expect(composer).toHaveValue("");
    expect(composer).not.toHaveAttribute("readonly");
  });

  it("cancels a queued voice send and restores the original draft", async () => {
    const sessions = mockSpeechRecognition();
    openPage();
    const composer = await screen.findByRole("textbox", { name: "Write a message…" });
    fireEvent.change(composer, { target: { value: "Original draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Dictate a message" }));
    const [recognition] = sessions;
    act(() => recognition.result("Discard this"));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard dictation" }));
    expect(recognition.abort).toHaveBeenCalledOnce();
    expect(recognition.onend).toBeNull();
    expect(composer).toHaveValue("Original draft");
    expect(composer).not.toHaveAttribute("readonly");
    expect(message).not.toHaveBeenCalled();
  });

  it("uses microphone samples for the waveform and releases its audio track on cancellation", async () => {
    mockSpeechRecognition();
    const stopTrack = vi.fn();
    const closeContext = vi.fn().mockResolvedValue(undefined);
    const readSamples = vi.fn((samples: Uint8Array) => samples.fill(190));
    class AudioContextMock {
      state = "running";
      resume = vi.fn().mockResolvedValue(undefined);
      close = closeContext;
      createMediaStreamSource = () => ({ connect: vi.fn() });
      createAnalyser = () => ({ fftSize: 512, getByteTimeDomainData: readSamples });
    }
    const devices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }),
    } });
    vi.stubGlobal("AudioContext", AudioContextMock);
    try {
      openPage();
      fireEvent.click(await screen.findByRole("button", { name: "Dictate a message" }));
      const meter = screen.getByRole("status", { name: "Microphone active" });
      await waitFor(() => expect(readSamples).toHaveBeenCalled());
      expect(meter.querySelector("rect:last-child")).not.toHaveAttribute("height", "3");
      fireEvent.click(screen.getByRole("button", { name: "Discard dictation" }));
      expect(stopTrack).toHaveBeenCalledOnce();
      expect(closeContext).toHaveBeenCalledOnce();
      expect(meter).not.toBeInTheDocument();
    } finally {
      if (devices) Object.defineProperty(navigator, "mediaDevices", devices);
      else Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });

  it("keeps the draft editable when microphone access is denied and releases recognition on exit", async () => {
    const sessions = mockSpeechRecognition();
    const view = openPage();
    const composer = await screen.findByRole("textbox", { name: "Write a message…" });
    fireEvent.change(composer, { target: { value: "Budget" } });
    fireEvent.click(screen.getByRole("button", { name: "Dictate a message" }));
    act(() => sessions[0].onerror?.({ error: "not-allowed" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Microphone access is unavailable");
    expect(composer).toHaveValue("Budget");
    expect(composer).not.toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Dictate a message" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    view.unmount();
    expect(sessions[1].abort).toHaveBeenCalledOnce();
    expect(sessions[1].onresult).toBeNull();
    expect(message).not.toHaveBeenCalled();
  });

  it("explains when live dictation is unavailable and leaves the draft intact", async () => {
    vi.stubGlobal("SpeechRecognition", undefined);
    vi.stubGlobal("webkitSpeechRecognition", undefined);
    openPage();
    const composer = await screen.findByRole("textbox", { name: "Write a message…" });
    fireEvent.change(composer, { target: { value: "Budget" } });
    fireEvent.click(screen.getByRole("button", { name: "Dictate a message" }));
    expect(screen.getByRole("alert")).toHaveTextContent("doesn’t support live dictation");
    expect(composer).toHaveValue("Budget");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  it("releases the microphone when the tab is hidden and caps the preserved draft", async () => {
    const sessions = mockSpeechRecognition();
    openPage();
    const composer = await screen.findByRole("textbox", { name: "Write a message…" });
    const typed = "a".repeat(1995);
    fireEvent.change(composer, { target: { value: typed } });
    fireEvent.click(screen.getByRole("button", { name: "Dictate a message" }));
    act(() => sessions[0].result("groceries"));
    expect(composer).toHaveValue(`${typed} groc`);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    try {
      fireEvent(document, new Event("visibilitychange"));
      expect(sessions[0].abort).toHaveBeenCalledOnce();
      expect(composer).toHaveValue(`${typed} groc`);
      expect(composer).not.toHaveAttribute("readonly");
      expect(message).not.toHaveBeenCalled();
    } finally {
      hidden.mockRestore();
    }
  });

  it("uses the server for free-form text and sends a reply with the selected message", async () => {
    openPage();
    expect(
      await screen.findByText(/manage your money more effectively/),
    ).toBeVisible();
    expect(screen.queryByText("DEMO")).not.toBeInTheDocument();
    expect(screen.queryByText("Two transactions")).not.toBeInTheDocument();
    const composer = screen.getByRole("textbox", { name: "Write a message…" });
    fireEvent.change(composer, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Hello from Groshly AI.")).toBeVisible();
    expect(message).toHaveBeenCalledWith(
      "fixture-bot",
      expect.objectContaining({ text: "hello", history: [] }),
      expect.anything(),
    );

    const [userToggle, toggle] = screen.getAllByLabelText("Message actions");
    const styles = document.createElement("style");
    styles.textContent = readFileSync("src/groshly/assistant.css", "utf8");
    document.head.append(styles);
    try {
      const userBubble = userToggle.closest(".bubble")!;
      const assistantBubble = toggle.closest(".bubble")!;
      expect(getComputedStyle(userToggle).insetInlineEnd).toBe("4px");
      expect(getComputedStyle(userBubble).paddingRight).toBe("42px");
      expect(getComputedStyle(toggle).insetInlineStart).toBe("4px");
      expect(getComputedStyle(assistantBubble).paddingLeft).toBe("42px");
    } finally {
      styles.remove();
    }
    fireEvent.click(toggle);
    fireEvent.click(
      within(toggle.parentElement!).getByRole("button", { name: "Reply" }),
    );
    fireEvent.change(composer, { target: { value: "What can you do?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(message).toHaveBeenLastCalledWith(
        "fixture-bot",
        expect.objectContaining({
          text: "What can you do?",
          replyTo: { role: "assistant", text: "Hello from Groshly AI." },
        }),
        expect.anything(),
      ),
    );
  });

  it("shows the chunks as they arrive and offers retry after an interrupted reply", async () => {
    let deliver: ((delta: string) => void) | undefined;
    let fail: ((error: Error) => void) | undefined;
    message.mockImplementationOnce(
      (_botId, _input, options) =>
        new Promise((_resolve, reject) => {
          deliver = options.onDelta;
          fail = reject;
        }),
    );
    openPage();
    const composer = await screen.findByRole("textbox", {
      name: "Write a message…",
    });
    fireEvent.change(composer, { target: { value: "What can you do?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("status", {
      name: "Groshly AI is preparing a reply",
    });
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    await waitFor(() => expect(deliver).toBeDefined());
    act(() => deliver!("I can"));
    const partial = await screen.findByText("I can");
    expect(partial).toBeVisible();
    expect(partial.closest(".groshly-assistant-response")?.nextElementSibling).toBe(screen.getByRole("button", { name: "Stop" }));
    act(() => deliver!(" explain spending"));
    expect(await screen.findByText("I can explain spending")).toBeVisible();
    act(() =>
      fail!(
        Object.assign(new Error("Interrupted"), {
          code: "BadGatewayException",
        }),
      ),
    );
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent(
      "Groshly AI couldn’t finish the reply.",
    );
    expect(screen.getByText("I can explain spending")).toBeVisible();
    fireEvent.click(within(error).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Hello from Groshly AI.")).toBeVisible();
    expect(screen.getAllByText("What can you do?")).toHaveLength(1);
  });

  it("stops the stream and keeps the visible fragment without showing an error", async () => {
    let signal: AbortSignal | undefined;
    message.mockImplementationOnce((_botId, _input, options) =>
      new Promise((_resolve, reject) => {
        signal = options.signal;
        signal!.addEventListener("abort", () => reject(signal!.reason), { once: true });
        options.onDelta("Your balance is");
      }),
    );
    openPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Write a message…" }), { target: { value: "How much do I have?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const stop = await screen.findByRole("button", { name: "Stop" });
    const partial = screen.getByText("Your balance is");
    expect(partial.closest(".groshly-assistant-response")).toHaveAttribute("translate", "no");
    // Simulate an extension wrapping the streamed text before React replaces the bubble.
    const wrapper = document.createElement("font");
    wrapper.textContent = partial.textContent;
    partial.replaceChildren(wrapper);
    fireEvent.click(stop);
    await waitFor(() => expect(signal?.aborted).toBe(true));
    expect(screen.getByText("Your balance is")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("restores the selected chat and keeps advice and transaction histories separate", async () => {
    const advice = { id: "advice", title: "Planning", mode: "ADVICE" };
    const transactions = { id: "transactions", title: "Receipts", mode: "TRANSACTIONS" };
    chats.mockResolvedValue({ items: [transactions, advice], nextCursor: null });
    chat.mockResolvedValue(advice);
    turns.mockImplementation(async (_botId, chatId) => ({
      items: [{
        id: "first",
        userText: chatId === advice.id ? "How can I start a budget?" : "Coffee yesterday",
        assistantText: chatId === advice.id ? "Start with your recurring costs." : "Check the amount before saving.",
        replyTo: null,
      }],
    }));
    const first = openPage();
    fireEvent.click(await screen.findByRole("button", { name: "Receipts" }));
    expect(await screen.findByText("Coffee yesterday")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Planning" }));
    expect(await screen.findByText("Start with your recurring costs.")).toBeVisible();
    expect(screen.queryByText("Coffee yesterday")).not.toBeInTheDocument();
    first.unmount();
    openPage();
    expect(await screen.findByText("How can I start a budget?")).toBeVisible();
    expect(screen.queryByText("Coffee yesterday")).not.toBeInTheDocument();
  });

  it("creates a chat on first send, puts its ID in the URL and allows renaming and deleting it", async () => {
    const newChat = { id: "budget-chat", title: "How can I plan a budget?", mode: "GENERAL" };
    chats.mockResolvedValue({ items: [], nextCursor: null });
    createChat.mockImplementation(async () => {
      chats.mockResolvedValue({ items: [newChat], nextCursor: null });
      return newChat;
    });
    renameChat.mockImplementation(async () => {
      const renamed = { ...newChat, title: "Monthly budget" };
      chats.mockResolvedValue({ items: [renamed], nextCursor: null });
      return renamed;
    });
    deleteChat.mockImplementation(async () => {
      chats.mockResolvedValue({ items: [], nextCursor: null });
    });
    openPage();
    const composer = await screen.findByRole("textbox", { name: "Write a message…" });
    expect(createChat).not.toHaveBeenCalled();
    fireEvent.change(composer, { target: { value: newChat.title } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Hello from Groshly AI.")).toBeVisible();
    expect(new URLSearchParams(window.location.search).get("chat")).toBe(newChat.id);
    expect(createChat).toHaveBeenCalledWith("fixture-bot", { title: newChat.title, mode: "GENERAL", chatId: expect.any(String) }, expect.any(AbortSignal));
    expect(message).toHaveBeenCalledWith("fixture-bot", expect.objectContaining({ chatId: newChat.id, turnId: expect.any(String) }), expect.anything());

    fireEvent.click(await screen.findByRole("button", { name: "Rename chat" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Chat name" }), { target: { value: "Monthly budget" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Monthly budget" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(new URLSearchParams(window.location.search).has("chat")).toBe(false);
    expect(composer).not.toBeInTheDocument();
    expect(createChat).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete chat" }).at(-1)!);
    await waitFor(() => expect(deleteChat).toHaveBeenCalledWith("fixture-bot", newChat.id));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Monthly budget" })).not.toBeInTheDocument());
  });

  it("explains the Plus requirement without sending from the Free account", async () => {
    entitlement.remaining = 0;
    openPage();
    expect(
      await screen.findByText("Groshly AI is included with Plus"),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Send" }),
    ).not.toBeInTheDocument();
    expect(message).not.toHaveBeenCalled();
  });
});
