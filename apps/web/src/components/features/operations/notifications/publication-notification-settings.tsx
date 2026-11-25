"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Bot, Eye, UsersRound } from "lucide-react";
import {
  publicationNotificationDestinations,
  type PublicationNotificationDestination,
  type PublicationNotificationPreview,
  type PublicationNotificationLine,
  type PublicationNotificationSettings as Settings,
} from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import {
  Button,
  CustomSelect,
  Card,
  LoadingState,
  Modal,
  ToggleRow,
} from "@/components/ui/primitives";
import { publicationNotificationsApi } from "@/lib/features/operations/publication-notifications-api";
import { publicationNotificationKeys } from "@/lib/query-keys";

function MessagePreview({
  title,
  lines,
  destination,
}: {
  title: string;
  lines: PublicationNotificationLine[];
  destination?: PublicationNotificationDestination;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-neutral-300">{title}</h3>
      {destination && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-neutral-400">
          {destinationOptions.find(({ value }) => value === destination)?.icon}{" "}
          {destinationLabels[destination]}
        </p>
      )}
      <div
        className={`space-y-1 rounded-xl p-3 text-sm leading-6 text-white ${destination === "IN_APP" ? "border border-neutral-700 bg-neutral-900" : "bg-[#1e2c3b]"}`}
      >
        {lines.map(({ text, href, icon, strong }, index) => (
          <div
            key={index}
            className="flex items-center gap-1.5 break-words [overflow-wrap:anywhere]"
          >
            {icon && <IconAvatar icon={icon} size="xs" decorative />}
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-sky-300 underline"
              >
                {text}
              </a>
            ) : (
              <span className={strong ? "font-semibold" : undefined}>
                {text}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const destinationLabels: Record<PublicationNotificationDestination, string> = {
  IN_APP: "В приложении",
  TELEGRAM_GROUP: "В Telegram-группу",
  TELEGRAM_PRIVATE: "Лично через системного бота",
};

const destinationIcons = {
  IN_APP: Bell,
  TELEGRAM_GROUP: UsersRound,
  TELEGRAM_PRIVATE: Bot,
};
const destinationOptions = publicationNotificationDestinations.map((value) => {
  const Icon = destinationIcons[value];
  return {
    value,
    label: destinationLabels[value],
    icon: <Icon size={16} aria-hidden />,
  };
});

const messageTypes = [
  {
    field: "coverageDestination",
    preview: "coverage",
    title: "Запас публикаций",
  },
  {
    field: "autopilotDestination",
    preview: "autopilot",
    title: "Отчёт автопилота AI Posting",
  },
  {
    field: "autopilotErrorDestination",
    preview: "autopilotError",
    title: "Отчёт AI Posting с ошибками",
  },
] as const;

export function PublicationNotificationSettings({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [previewOpen, setPreviewOpen] = useState<
    false | "all" | keyof PublicationNotificationPreview
  >(false);
  const [channelId, setChannelId] = useState("");
  const queryKey = publicationNotificationKeys.settings(workspaceId);
  const settings = useQuery({
    queryKey,
    queryFn: ({ signal }) => publicationNotificationsApi.settings(signal),
  });
  const channels = settings.data?.channels ?? [];
  const selectedChannelId = channels.some(({ id }) => id === channelId)
    ? channelId
    : (channels[0]?.id ?? "");
  const preview = useQuery({
    queryKey: publicationNotificationKeys.preview(
      workspaceId,
      selectedChannelId,
    ),
    queryFn: ({ signal }) =>
      publicationNotificationsApi.preview(selectedChannelId, signal),
    enabled: Boolean(previewOpen),
  });
  const save = useMutation({
    mutationFn: publicationNotificationsApi.save,
    onSuccess: (value) => {
      client.setQueryData(queryKey, value);
      setDraft(null);
    },
  });
  const persisted = settings.data;
  const value =
    draft ??
    (persisted && {
      enabled: persisted.enabled,
      excludedChannelIds: persisted.excludedChannelIds,
      coverageDestination: persisted.coverageDestination,
      autopilotDestination: persisted.autopilotDestination,
      autopilotErrorDestination: persisted.autopilotErrorDestination,
    });

  return (
    <Card className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Уведомления о публикациях
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            Выберите, куда отправлять каждый тип сообщения.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setPreviewOpen("all")}
        >
          <Eye size={16} aria-hidden /> Предпросмотр сообщений
        </Button>
      </header>
      {settings.isLoading && <LoadingState />}
      {settings.isError && (
        <p role="alert" className="text-sm text-rose-300">
          Не удалось загрузить настройки.{" "}
          <button className="underline" onClick={() => void settings.refetch()}>
            Повторить
          </button>
        </p>
      )}
      {value && (
        <>
          {messageTypes.map(({ field, preview, title }) => (
            <div
              key={field}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-800 p-3"
            >
              <div className="min-w-0 flex-1 text-sm font-medium text-neutral-200">
                {title}
                <CustomSelect
                  ariaLabel={title}
                  className="mt-1"
                  value={value[field]}
                  options={destinationOptions}
                  searchable={false}
                  disabled={save.isPending}
                  onChange={(destination) =>
                    setDraft({
                      ...value,
                      [field]:
                        destination as PublicationNotificationDestination,
                    })
                  }
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPreviewOpen(preview)}
                aria-label={`Предпросмотр: ${title}`}
              >
                <Eye size={16} aria-hidden /> Предпросмотр
              </Button>
            </div>
          ))}
          <ToggleRow
            label="Уведомлять о запасе публикаций"
            description="Когда осталось три дня или на сегодня ничего не запланировано."
            checked={value.enabled}
            disabled={save.isPending}
            onChange={(enabled) => setDraft({ ...value, enabled })}
          />
          {channels.length ? (
            <details className="rounded-lg border border-neutral-800 p-3">
              <summary className="cursor-pointer text-sm font-medium text-neutral-200">
                {value.excludedChannelIds.length
                  ? `Исключено каналов: ${value.excludedChannelIds.length}`
                  : "Все активные каналы"}
              </summary>
              <fieldset
                className="mt-3 grid max-h-64 gap-1 overflow-auto sm:grid-cols-2"
                disabled={save.isPending}
              >
                <legend className="mb-2 text-sm text-neutral-400">
                  Снимите отметки у каналов, которые хотите исключить.
                </legend>
                {channels.map(({ id, title, iconPresentation }) => (
                  <label
                    key={id}
                    className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm text-neutral-200 hover:bg-neutral-800"
                  >
                    <input
                      type="checkbox"
                      className="accent-blue-500"
                      checked={!value.excludedChannelIds.includes(id)}
                      onChange={({ target }) =>
                        setDraft({
                          ...value,
                          excludedChannelIds: target.checked
                            ? value.excludedChannelIds.filter(
                                (item) => item !== id,
                              )
                            : [...value.excludedChannelIds, id],
                        })
                      }
                    />
                    {iconPresentation && (
                      <IconAvatar
                        icon={iconPresentation}
                        size="xs"
                        decorative
                      />
                    )}
                    <span>{title}</span>
                  </label>
                ))}
              </fieldset>
            </details>
          ) : (
            <p className="text-sm text-neutral-400">
              Активных каналов пока нет.
            </p>
          )}
          {draft && (
            <Button
              disabled={save.isPending}
              onClick={() => save.mutate(draft)}
            >
              {save.isPending ? "Сохраняем…" : "Сохранить"}
            </Button>
          )}
          {save.isError && (
            <p role="alert" className="text-sm text-rose-300">
              Не удалось сохранить настройки. Попробуйте ещё раз.
            </p>
          )}
        </>
      )}
      <Modal
        open={Boolean(previewOpen)}
        onClose={() => setPreviewOpen(false)}
        title="Как выглядят сообщения"
        size="xl"
      >
        <div className="space-y-4">
          {channels.length > 0 && (
            <div className="block text-sm font-medium text-neutral-300">
              Канал для предпросмотра
              <CustomSelect
                ariaLabel="Канал для предпросмотра"
                className="mt-1"
                value={selectedChannelId}
                onChange={setChannelId}
                options={channels.map(({ id, title, iconPresentation }) => ({
                  value: id,
                  label: title,
                  iconPresentation: iconPresentation ?? undefined,
                }))}
              />
            </div>
          )}
          <p className="text-sm text-neutral-400">
            Цифры в предпросмотре приведены для примера.
          </p>
          {preview.isLoading && <LoadingState />}
          {preview.isError && (
            <p role="alert" className="text-sm text-rose-300">
              Не удалось загрузить предпросмотр.{" "}
              <button
                className="underline"
                onClick={() => void preview.refetch()}
              >
                Повторить
              </button>
            </p>
          )}
          {preview.data && (
            <div
              className={
                previewOpen === "all"
                  ? "grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3"
                  : "max-w-lg"
              }
            >
              {messageTypes
                .filter(
                  (type) =>
                    previewOpen === "all" || type.preview === previewOpen,
                )
                .map(({ title, preview: key, field }) => (
                  <MessagePreview
                    key={key}
                    title={title}
                    lines={preview.data[key]}
                    destination={value?.[field]}
                  />
                ))}
            </div>
          )}
        </div>
      </Modal>
    </Card>
  );
}
