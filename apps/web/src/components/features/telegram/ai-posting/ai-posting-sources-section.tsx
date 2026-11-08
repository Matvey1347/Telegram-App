"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, CustomSelect, Input } from "@/components/ui/primitives";

type Source = {
  id: string;
  type: "website" | "rss" | "telegram" | "history";
  value: string;
  enabled: boolean;
  checked?: string;
  rightsConfirmed?: boolean;
};
type Config = { sources: Source[] };
export function AiPostingSourcesSection({
  channelId,
  config,
  patch,
}: {
  channelId: string;
  config: Config;
  patch: (v: Partial<Config>) => void;
}) {
  const [newSource, setNewSource] = useState("");
  const [newSourceType, setNewSourceType] = useState<Source["type"]>("website");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const sourceChannels = useQuery({
    queryKey: ["telegram-ai-posting", channelId, "source-channels"],
    queryFn: async () =>
      (
        await api.get(
          `/telegram-channels/${channelId}/ai-posting/source-channels`,
        )
      ).data as Array<{ id: string; title: string; username: string | null }>,
    enabled: Boolean(channelId) && newSourceType === "telegram",
  });
  const addSource = () => {
    if (!newSource.trim() || config.sources.length >= 5) return;
    patch({
      sources: [
        ...config.sources,
        {
          id: crypto.randomUUID(),
          type: newSourceType,
          value: newSource.trim(),
          enabled: true,
          ...(newSourceType === "website" || newSourceType === "rss"
            ? { rightsConfirmed }
            : {}),
        },
      ],
    });
    setNewSource("");
  };
  const checkSource = async (id: string) => {
    const result = (
      await api.post(
        `/telegram-channels/${channelId}/ai-posting/check-source`,
        { sourceId: id },
      )
    ).data as { ok: boolean; message: string };
    patch({
      sources: config.sources.map((s) =>
        s.id === id ? { ...s, checked: result.message } : s,
      ),
    });
  };
  return (
    <section className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Источники идей</h2>
      <p className="text-sm text-neutral-400">
        Добавьте до 5 сайтов, RSS или доступных Telegram-каналов. История
        канала управляется отдельно.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="w-full sm:w-48">
          <CustomSelect
            value={newSourceType}
            onChange={(v) => {
              setNewSourceType(v as Source["type"]);
              setNewSource("");
            }}
            options={[
              { value: "website", label: "Сайт" },
              { value: "rss", label: "RSS" },
              { value: "telegram", label: "Telegram-канал" },
            ]}
          />
        </div>
        {newSourceType === "telegram" ? (
          <div className="min-w-0 flex-1">
            <CustomSelect
              value={newSource}
              onChange={setNewSource}
              placeholder={
                sourceChannels.isLoading
                  ? "Загрузка каналов…"
                  : "Выберите доступный канал"
              }
              options={(sourceChannels.data ?? []).map((item) => ({
                value: item.id,
                label: item.title,
                meta: item.username ? `@${item.username}` : undefined,
              }))}
            />
          </div>
        ) : (
          <Input
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            placeholder="URL источника"
          />
        )}
        <Button onClick={addSource} disabled={config.sources.length >= 5}>
          <Plus size={16} /> Добавить
        </Button>
      </div>
      {(newSourceType === "website" || newSourceType === "rss") && (
        <label className="flex items-start gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(event) => setRightsConfirmed(event.target.checked)}
          />
          Подтверждаю право использовать изображения с этого источника
        </label>
      )}
      <div className="space-y-2">
        {config.sources.map((source) => (
          <div
            key={source.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 p-3"
          >
            <input
              type="checkbox"
              aria-label={`Источник включён: ${source.value}`}
              checked={source.enabled}
              onChange={(e) =>
                patch({
                  sources: config.sources.map((s) =>
                    s.id === source.id
                      ? { ...s, enabled: e.target.checked }
                      : s,
                  ),
                })
              }
            />
            <span className="min-w-0 flex-1 break-all text-sm">
              {source.type.toUpperCase()} ·{" "}
              {source.type === "telegram"
                ? (sourceChannels.data?.find((item) => item.id === source.value)
                    ?.title ?? source.value)
                : source.value}
              {source.checked && (
                <span className="block text-xs text-neutral-400">
                  {source.checked}
                </span>
              )}
              {(source.type === "website" || source.type === "rss") && (
                <label className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
                  <input
                    type="checkbox"
                    checked={Boolean(source.rightsConfirmed)}
                    onChange={(event) =>
                      patch({
                        sources: config.sources.map((item) =>
                          item.id === source.id
                            ? { ...item, rightsConfirmed: event.target.checked }
                            : item,
                        ),
                      })
                    }
                  />
                  Есть право использовать изображения
                </label>
              )}
            </span>
            <Button
              variant="secondary"
              onClick={() => void checkSource(source.id)}
            >
              Проверить
            </Button>
            <button
              aria-label="Удалить источник"
              className="p-2 text-neutral-400 hover:text-rose-300"
              onClick={() =>
                patch({
                  sources: config.sources.filter((s) => s.id !== source.id),
                })
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
