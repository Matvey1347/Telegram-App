import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AiPostingChatPublication } from "./ai-posting-chat-publication";
const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn().mockResolvedValue({ data: [] }) }));
vi.mock("@/lib/api", () => ({ api: { post: mocks.post, get: mocks.get } }));

it("generates the requested topic and revises the same publication", async () => {
  mocks.post.mockResolvedValueOnce({ data: { runId: "run", version: 2, generated: [{ title: "Заголовок", text: "Первый текст", imageUrl: null }] } }).mockResolvedValueOnce({ data: { version: 3, publications: [{ title: "Заголовок", text: "Текст с правками" }] } });
  render(<QueryClientProvider client={new QueryClient()}><AiPostingChatPublication channelId="channel" topic="Новая рубрика" feedback="Добавить факты" /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Попробовать сгенерировать публикацию" }));
  expect(await screen.findByText("Первый текст")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Применить правки из поля к этой публикации" }));
  expect(await screen.findByText("Текст с правками")).toBeInTheDocument();
  expect(mocks.post).toHaveBeenLastCalledWith("/telegram-channels/channel/ai-posting/test-runs/run/review", { index: 0, expectedVersion: 2, action: "regenerate-text", value: "Добавить факты" });
});

it("shows a failure if no publication was produced", async () => {
  mocks.post.mockResolvedValueOnce({ data: { runId: "run", version: 2, generated: [], failures: [{}] } });
  render(<QueryClientProvider client={new QueryClient()}><AiPostingChatPublication channelId="channel" topic="Тема" feedback="" /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Попробовать сгенерировать публикацию" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Публикация не создана");
});
