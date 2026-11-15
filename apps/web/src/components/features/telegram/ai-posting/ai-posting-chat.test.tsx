import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AiPostingChat } from "./ai-posting-chat";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("@/lib/api", () => ({ api: { post: mocks.post, get: mocks.get } }));
vi.mock("./ai-posting-chat-voice", () => ({ recordingToPcmWav: async (file: File) => file }));

beforeEach(() => {
  mocks.post.mockReset();
  mocks.get.mockReset().mockImplementation(async (url: string) => {
    if (!url.endsWith("/ai-posting/chat")) return { data: [] };
    const index = mocks.post.mock.calls.findLastIndex(
      ([path]) => path.endsWith("/ai-posting/chat"),
    );
    if (index < 0) return { data: [] };
    const request = mocks.post.mock.calls[index][1];
    const response = await mocks.post.mock.results[index].value;
    return {
      data: [
        ...request.messages,
        {
          role: "assistant",
          text: response.data.reply,
          suggestedTopic: response.data.suggestedTopic,
        },
      ],
    };
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn().mockReturnValue("blob:test"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

it("sends the message to the selected channel and shows the returned answer", async () => {
  mocks.post.mockResolvedValueOnce({ data: { reply: "Обсудим рубрику" } });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AiPostingChat active channelId="channel-a" />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mocks.get).toHaveBeenCalled());
  expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), {
    target: { value: "Нужна рубрика" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Отправить сообщение" }));
  expect(await screen.findByText("Обсудим рубрику")).toBeInTheDocument();
  expect(mocks.post).toHaveBeenCalledWith(
    "/telegram-channels/channel-a/ai-posting/chat",
    { messages: [{ role: "user", text: "Нужна рубрика" }] },
  );
});

it("keeps the message for retry if the request fails", async () => {
  mocks.post.mockRejectedValueOnce(new Error("offline"));
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <AiPostingChat active channelId="channel-b" />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mocks.get).toHaveBeenCalled());
  fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), {
    target: { value: "Моя правка" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Отправить сообщение" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(screen.getByRole("textbox", { name: "Сообщение" })).toHaveValue(
    "Моя правка",
  );
});

it("analyses an attached image before sending it as clearly marked context", async () => {
  mocks.get.mockImplementation(async (url: string) => ({ data: url.endsWith("/chat") && mocks.post.mock.calls.length >= 2 ? [
      { role: "user", text: "Посмотри [изображение]" },
      {
        role: "assistant",
        text: "Учту изображение. Источник добавить не удалось",
      },
    ] : [] }));
  mocks.post
    .mockResolvedValueOnce({
      data: {
        id: "image-id",
        kind: "image",
        name: "sample.png",
        analysis: "Видно здание",
      },
    })
    .mockResolvedValueOnce({
      data: {
        reply: "Учту изображение. Источник добавить не удалось",
        actions: [
          {
            kind: "source",
            status: "failed",
            message: "Источник добавить не удалось",
          },
        ],
      },
    });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AiPostingChat active channelId="channel-c" />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mocks.get).toHaveBeenCalled());
  const input = screen.getByLabelText("Выбрать изображение или аудио");
  fireEvent.change(input, {
    target: {
      files: [new File(["picture"], "sample.png", { type: "image/png" })],
    },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), {
    target: { value: "Посмотри" },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Отправить сообщение" }));
  expect(
    await screen.findByText("Учту изображение. Источник добавить не удалось"),
  ).toBeInTheDocument();
  const call = mocks.post.mock.calls.find(
    (item) => item[0] === "/telegram-channels/channel-c/ai-posting/chat",
  );
  expect(call?.[1].messages[0].text).toBe("Посмотри");
  expect(call?.[1].attachmentIds).toEqual(["image-id"]);
  expect(JSON.stringify(call?.[1])).not.toContain("Видно здание");
});

it("does not claim an unsupported file was sent", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AiPostingChat active channelId="channel-d" />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Выбрать изображение или аудио"), {
    target: {
      files: [new File(["data"], "file.pdf", { type: "application/pdf" })],
    },
  });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Поддерживаются изображения",
  );
});

it("sends a WAV recording for transcription before asking the assistant", async () => {
  const createUrl = vi.fn().mockReturnValue("blob:audio-test");
  const revokeUrl = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createUrl,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeUrl,
  });
  mocks.get.mockImplementation(async (url: string) => ({ data: url.endsWith("/chat") && mocks.post.mock.calls.length >= 2 ? [
      { role: "user", text: "[голос]" },
      { role: "assistant", text: "Зрозуміло" },
    ] : [] }));
  mocks.post
    .mockResolvedValueOnce({
      data: {
        id: "voice-id",
        kind: "audio",
        name: "voice.wav",
        transcript: "Зробіть пост коротшим",
        durationSeconds: 3,
      },
    })
    .mockResolvedValueOnce({ data: { reply: "Зрозуміло" } });
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <AiPostingChat active channelId="channel-e" />
    </QueryClientProvider>,
  );
  const input = screen.getByLabelText("Выбрать изображение или аудио");
  fireEvent.change(input, {
    target: { files: [new File(["RIFF"], "voice.wav", { type: "audio/wav" })] },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Отправить сообщение" }));
  expect(await screen.findByText("Зрозуміло")).toBeInTheDocument();
  const call = mocks.post.mock.calls.find(
    (item) => item[0] === "/telegram-channels/channel-e/ai-posting/chat",
  );
  expect(call?.[1].messages[0].text).toBe("");
  expect(call?.[1].attachmentIds).toEqual(["voice-id"]);
  expect(JSON.stringify(call?.[1])).not.toContain("Зробіть пост коротшим");
  view.unmount();
  expect(revokeUrl).toHaveBeenCalledWith("blob:audio-test");
});

it("prevents chat actions when channel settings have unsaved edits", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AiPostingChat active channelId="channel-f" settingsReady={false} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), {
    target: { value: "Добавь рубрику" },
  });
  expect(
    screen.getByText(/Сохраните настройки канала перед сообщением/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeDisabled();
  expect(mocks.post).not.toHaveBeenCalled();
});

it("uses the assistant suggested topic instead of the user's instruction", async () => {
  mocks.post.mockResolvedValueOnce({
    data: {
      reply: "Рубрика готова",
      suggestedTopic: "Nova Poshta: система доставки",
    },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AiPostingChat active channelId="channel-g" />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mocks.get).toHaveBeenCalled());
  fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), {
    target: { value: "Создай рубрику" },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Отправить сообщение" }));
  expect(await screen.findByText("Рубрика готова")).toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "Попробовать сгенерировать публикацию",
    }),
  ).toBeEnabled();
});

it("sends feedback with the generated publication identity and shows the revision", async () => {
  mocks.post.mockResolvedValueOnce({ data: { reply: "Попробуем тему", suggestedTopic: "Кофейня" } })
    .mockResolvedValueOnce({ data: { runId: "run-1", version: 2, generated: [{ title: "До", text: "Прежний текст", imageUrl: null }] } })
    .mockResolvedValueOnce({ data: { reply: "Изменил текст", revisedPublication: { runId: "run-1", version: 3, publication: { title: "После", text: "Новый текст", imageUrl: null } } } });
  render(<QueryClientProvider client={new QueryClient()}><AiPostingChat active channelId="channel-h" /></QueryClientProvider>);
  await waitFor(() => expect(mocks.get).toHaveBeenCalled());
  fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), { target: { value: "Предложи тему" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Отправить сообщение" }));
  await screen.findByText("Попробуем тему");
  fireEvent.click(screen.getByRole("button", { name: "Попробовать сгенерировать публикацию" }));
  await screen.findByText("Прежний текст");
  fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), { target: { value: "Сделай короче" } });
  fireEvent.click(screen.getByRole("button", { name: "Отправить сообщение" }));
  expect(await screen.findByText("Новый текст")).toBeInTheDocument();
  const call = mocks.post.mock.calls.filter((item) => item[0] === "/telegram-channels/channel-h/ai-posting/chat").at(-1);
  expect(call?.[1].publication).toEqual({ runId: "run-1", version: 2, index: 0 });
});

it("explains the combined transcription length limit and preserves input", async () => {
  mocks.post.mockRejectedValueOnce({ response: { status: 400, data: { message: "AI_POSTING_CHAT_MESSAGE_TOO_LONG" } } });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><AiPostingChat active channelId="channel-i" /></QueryClientProvider>);
  fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), { target: { value: "Мой текст" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Отправить сообщение" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("расшифровкой слишком длинное");
  expect(screen.getByRole("textbox", { name: "Сообщение" })).toHaveValue("Мой текст");
});
