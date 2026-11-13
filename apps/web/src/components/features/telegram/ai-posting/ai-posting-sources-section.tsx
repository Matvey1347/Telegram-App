"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { telegramAiPostingKeys } from "@/lib/query-keys";
import {
  Button,
  Card,
  CustomSelect,
  IconButton,
  Input,
  Textarea,
  ToggleRow,
} from "@/components/ui/primitives";

type Source = {
  id: string;
  type: "website" | "rss" | "telegram" | "history";
  value: string;
  enabled: boolean;
  checked?: string;
  useImages?: boolean;
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
  const [useImages, setUseImages] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [json, setJson] = useState("");
  const [importError, setImportError] = useState("");
  const [fileName, setFileName] = useState("");
  const [checking, setChecking] = useState(false);
  const [sourceMessage, setSourceMessage] = useState("");
  const loadFile = async (file: File) => {
    if (file.size > 1024 * 1024) {
      setImportError("Файл должен быть не больше 1 МБ.");
      return;
    }
    try {
      const contents = await file.text();
      setJson(contents);
      setFileName(file.name);
      setImportError("");
    } catch {
      setImportError("Не удалось прочитать файл.");
    }
  };
  const checkCandidate = async (source: Source) =>
    (
      await api.post(
        `/telegram-channels/${channelId}/ai-posting/check-source`,
        { sourceId: source.id, source },
      )
    ).data as { ok: boolean; available?: boolean; message: string };
  const importSources = async () => {
    try {
      const parsed: unknown = JSON.parse(json);
      if (!Array.isArray(parsed)) throw new Error();
      const items: Source[] = parsed.map((item: unknown) => {
        if (!item || typeof item !== "object") throw new Error();
        const value = item as Record<string, unknown>;
        if (
          !["website", "rss", "telegram"].includes(String(value.type)) ||
          typeof value.value !== "string" ||
          !value.value.trim() ||
          (value.enabled !== undefined && typeof value.enabled !== "boolean") ||
          (value.useImages !== undefined &&
            typeof value.useImages !== "boolean")
        )
          throw new Error();
        return {
          id: crypto.randomUUID(),
          type: value.type as Source["type"],
          value: value.value.trim(),
          enabled: value.enabled !== false,
          useImages: value.useImages !== false,
        };
      });
      setChecking(true);
      const available: Source[] = [];
      const unavailable: string[] = [];
      for (const item of items) {
        if (item.enabled === false) {
          available.push(item);
          continue;
        }
        const check = await checkCandidate(item);
        if (check.available ?? check.ok) available.push(item);
        else unavailable.push(item.value);
      }
      patch({ sources: [...config.sources, ...available] });
      setSourceMessage(
        unavailable.length
          ? `Добавлено ${available.length}; недоступные источники пропущены: ${unavailable.join(", ")}`
          : `Проверено и добавлено источников: ${available.length}.`,
      );
      setJson("");
      setFileName("");
      setImportError("");
      setShowImport(false);
    } catch {
      setImportError(
        "Введите JSON-массив источников с полями type и value. Поля enabled и useImages должны быть логическими значениями.",
      );
    } finally {
      setChecking(false);
    }
  };
  const sourceChannels = useQuery({
    queryKey: telegramAiPostingKeys.sourceChannels(channelId),
    queryFn: async () =>
      (
        await api.get(
          `/telegram-channels/${channelId}/ai-posting/source-channels`,
        )
      ).data as Array<{
        id: string;
        title: string;
        username: string | null;
        photoUrl: string | null;
      }>,
    enabled: Boolean(channelId) && newSourceType === "telegram",
  });
  const addSource = async () => {
    if (!newSource.trim()) return;
    const source: Source = {
      id: crypto.randomUUID(),
      type: newSourceType,
      value: newSource.trim(),
      enabled: true,
      useImages,
    };
    setChecking(true);
    setSourceMessage("");
    try {
      const check = await checkCandidate(source);
      if (!(check.available ?? check.ok)) {
        setSourceMessage(`Источник не добавлен: ${check.message}`);
        return;
      }
      patch({
        sources: [...config.sources, { ...source, checked: check.message }],
      });
      setSourceMessage(check.message);
      setNewSource("");
    } catch {
      setSourceMessage("Не удалось проверить источник, он не добавлен.");
    } finally {
      setChecking(false);
    }
  };
  const checkSource = async (id: string) => {
    const source = config.sources.find((item) => item.id === id);
    if (!source) return;
    setChecking(true);
    try {
      const result = await checkCandidate(source);
      if (!(result.available ?? result.ok)) {
        patch({ sources: config.sources.filter((item) => item.id !== id) });
        setSourceMessage(`Недоступный источник удалён: ${result.message}`);
        return;
      }
      setSourceMessage(result.message);
      patch({
        sources: config.sources.map((s) =>
          s.id === id ? { ...s, checked: result.message } : s,
        ),
      });
    } catch {
      patch({ sources: config.sources.filter((item) => item.id !== id) });
      setSourceMessage(
        "Источник не удалось проверить и он удалён из настроек.",
      );
    } finally {
      setChecking(false);
    }
  };
  return (
    <Card className="space-y-4 bg-neutral-900/60">
      <h2 className="text-lg font-semibold">Источники идей</h2>
      <Button variant="secondary" onClick={() => setShowImport(!showImport)}>
        Импорт JSON
      </Button>
      {showImport && (
        <div className="space-y-2">
          <div
            className="rounded-lg border border-dashed border-neutral-700 bg-neutral-950 p-4 text-center text-sm text-neutral-300"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file) void loadFile(file);
            }}
          >
            <p>Перетащите JSON-файл сюда или выберите файл</p>
            <label className="mt-2 inline-flex cursor-pointer rounded-lg border border-blue-500/70 px-4 py-2 text-blue-200">
              Выбрать файл
              <input
                aria-label="Выбрать JSON-файл"
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void loadFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {fileName && (
              <p className="mt-2 break-all text-xs text-neutral-400">
                {fileName}
              </p>
            )}
          </div>
          <Textarea
            aria-label="JSON источников"
            value={json}
            onChange={(event) => setJson(event.target.value)}
            rows={6}
            placeholder={
              '[{"type":"rss","value":"https://example.com/feed","enabled":true,"useImages":true}]'
            }
          />
          {importError && (
            <p role="alert" className="text-sm text-rose-300">
              {importError}
            </p>
          )}
          <Button disabled={checking} onClick={() => void importSources()}>
            {checking ? "Проверяем источники…" : "Проверить и добавить из JSON"}
          </Button>
        </div>
      )}
      {sourceMessage && (
        <p role="status" className="text-sm text-neutral-300">
          {sourceMessage}
        </p>
      )}
      <p className="text-sm text-neutral-400">
        Добавьте сайты, RSS или доступные Telegram-каналы. История канала
        управляется отдельно.
      </p>
      <p className="-mt-2 text-xs text-neutral-500">
        Сайт — отдельная веб-страница, с которой берётся текст статьи. RSS —
        адрес ленты, из которой берутся отдельные новые записи; это не адрес
        главной страницы сайта.
      </p>
      <div className="flex flex-col gap-2 2xl:flex-row">
        <div className="w-full 2xl:w-48">
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
                iconUrl: item.photoUrl ?? undefined,
                iconFallback: item.title,
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
        <Button
          disabled={checking || !newSource.trim()}
          onClick={() => void addSource()}
        >
          <Plus size={16} /> Добавить
        </Button>
      </div>
      <ToggleRow
        checked={
          config.sources.length
            ? config.sources.every((source) => source.useImages !== false)
            : useImages
        }
        onChange={(enabled) => {
          setUseImages(enabled);
          patch({
            sources: config.sources.map((source) => ({
              ...source,
              useImages: enabled,
            })),
          });
        }}
        label="Использовать изображения из всех источников"
        className="w-fit !border-0 !bg-transparent !p-0"
      />
      <div className="space-y-2">
        {config.sources.map((source) => (
          <Card key={source.id} className="min-w-0 space-y-3 p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 text-sm">
                <span className="text-neutral-400">
                  {source.type.toUpperCase()} ·{" "}
                </span>
                <span className="break-all">
                  {source.type === "telegram"
                    ? (sourceChannels.data?.find(
                        (item) => item.id === source.value,
                      )?.title ?? source.value)
                    : source.value}
                </span>
                {source.checked && (
                  <p className="mt-1 text-xs text-neutral-400">
                    {source.checked}
                  </p>
                )}
              </div>
              <ToggleRow
                checked={source.enabled !== false}
                label={`Использовать источник: ${source.value}`}
                className="w-auto shrink-0 !border-0 !bg-transparent !p-0 [&>div]:sr-only"
                onChange={(enabled) =>
                  patch({
                    sources: config.sources.map((s) =>
                      s.id === source.id ? { ...s, enabled } : s,
                    ),
                  })
                }
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ToggleRow
                checked={source.useImages !== false}
                label="Использовать изображения из источника"
                className="w-auto !border-0 !bg-transparent !p-0"
                onChange={(useImages) =>
                  patch({
                    sources: config.sources.map((item) =>
                      item.id === source.id ? { ...item, useImages } : item,
                    ),
                  })
                }
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  disabled={checking}
                  onClick={() => void checkSource(source.id)}
                >
                  Проверить
                </Button>
                <IconButton
                  type="button"
                  kind="delete"
                  aria-label="Удалить источник"
                  onClick={() =>
                    patch({
                      sources: config.sources.filter((s) => s.id !== source.id),
                    })
                  }
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Card>
  );
}
