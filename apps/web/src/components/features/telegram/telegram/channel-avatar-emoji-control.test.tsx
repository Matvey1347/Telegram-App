import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramChannel } from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";
import { ChannelAvatarEmojiControl } from "./channel-avatar-emoji-control";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), restore: vi.fn() }));
vi.mock("@/lib/features/telegram/channel-avatar-emoji-api", () => ({ channelAvatarEmojiApi: mocks }));
vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: ({ iconId, disabled, onChange }: { iconId: string; disabled: boolean; onChange: (value: string) => void }) =>
    <button disabled={disabled} onClick={() => onChange("another-icon")}>Choose emoji: {iconId}</button>,
}));

function mount(channel: TelegramChannel) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(telegramChannelKeys.detail(channel.id), channel);
  client.setQueryData(telegramChannelKeys.lifecycleList("active"), { items: [channel] });
  function Harness() {
    const [selected, setSelected] = useState(channel.presentationIconId || null);
    return <ChannelAvatarEmojiControl channel={channel} selectedIconId={selected} onChange={setSelected} />;
  }
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
  return client;
}
const channel: TelegramChannel = { id: "sample-channel", title: "Sample", isActive: true, presentationIconId: "manual", avatarEmojiIconId: "avatar", avatarEmojiManual: true };

describe("ChannelAvatarEmojiControl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does no generation on mount and preserves a saved manual icon on refresh", async () => {
    const client = mount(channel);
    expect(mocks.refresh).not.toHaveBeenCalled();
    mocks.refresh.mockResolvedValue({ ...channel, avatarEmojiIconId: "new-avatar", avatarEmojiStatus: "READY" });
    fireEvent.click(screen.getByRole("button", { name: "Обновить emoji из аватарки" }));
    await screen.findByRole("button", { name: "Choose emoji: manual" });
    await waitFor(() => expect(client.getQueryData(telegramChannelKeys.detail(channel.id))).toMatchObject({ presentationIconId: "manual", avatarEmojiIconId: "new-avatar" }));
    expect(client.getQueryData(telegramChannelKeys.lifecycleList("active"))).toMatchObject({ items: [{ avatarEmojiIconId: "new-avatar" }] });
  });

  it("restores the saved avatar through an explicit command", async () => {
    mount(channel);
    mocks.restore.mockResolvedValue({ ...channel, presentationIconId: "avatar", avatarEmojiManual: false, avatarEmojiStatus: "READY" });
    fireEvent.click(screen.getByRole("button", { name: "Вернуть аватарку как иконку" }));
    expect(await screen.findByRole("button", { name: "Choose emoji: avatar" })).toBeInTheDocument();
    expect(mocks.restore).toHaveBeenCalledWith(channel.id);
  });

  it("keeps errors recoverable and serializes an in-flight refresh", async () => {
    mount(channel);
    let reject!: (reason: Error) => void;
    mocks.refresh.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    fireEvent.click(screen.getByRole("button", { name: "Обновить emoji из аватарки" }));
    expect(await screen.findByRole("button", { name: "Обновляем emoji…" })).toBeDisabled();
    reject(new Error("Telegram unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Попробуйте обновление ещё раз");
    expect(screen.getByRole("button", { name: "Обновить emoji из аватарки" })).toBeEnabled();
  });

  it("shows missing-avatar fallback and protects unsaved icon selection", () => {
    mount({ ...channel, avatarEmojiIconId: null, avatarEmojiStatus: "NO_AVATAR", avatarEmojiManual: false });
    expect(screen.getByRole("status")).toHaveTextContent("нет аватарки");
    fireEvent.click(screen.getByRole("button", { name: "Choose emoji: manual" }));
    expect(screen.getByRole("button", { name: "Обновить emoji из аватарки" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Сохраните выбранную иконку");
  });

  it("uses a refreshed parent channel after showing the local command response", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const onChange = vi.fn();
    const view = (value: TelegramChannel) => <QueryClientProvider client={client}>
      <ChannelAvatarEmojiControl channel={value} selectedIconId={value.presentationIconId || null} onChange={onChange} />
    </QueryClientProvider>;
    const rendered = render(view(channel));
    mocks.refresh.mockResolvedValue({ ...channel, avatarEmojiIconId: "new-avatar", avatarEmojiStatus: "ERROR", avatarEmojiError: "Temporary failure" });
    fireEvent.click(screen.getByRole("button", { name: "Обновить emoji из аватарки" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Temporary failure");
    expect(onChange).toHaveBeenCalledWith("manual", false);

    rendered.rerender(view({ ...channel, presentationIconId: "new-avatar", avatarEmojiIconId: "new-avatar", avatarEmojiStatus: "READY", avatarEmojiManual: false }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Используется emoji аватарки канала");
    expect(screen.getByRole("button", { name: "Вернуть аватарку как иконку" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Обновить emoji из аватарки" })).toBeEnabled();
  });

  it("shows a newly generated icon when the unchanged draft still contains the old pending value", () => {
    const client = new QueryClient();
    render(<QueryClientProvider client={client}>
      <ChannelAvatarEmojiControl
        channel={{ ...channel, presentationIconId: "generated-avatar", avatarEmojiIconId: "generated-avatar", avatarEmojiManual: false, avatarEmojiStatus: "READY" }}
        selectedIconId={null}
        selectionDirty={false}
        onChange={vi.fn()}
      />
    </QueryClientProvider>);
    expect(screen.getByRole("button", { name: "Choose emoji: generated-avatar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Обновить emoji из аватарки" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Используется emoji аватарки канала");
  });
});
