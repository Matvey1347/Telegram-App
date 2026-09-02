"use client";


import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock3, Plus, Trash2 } from "lucide-react";
import { IconPicker } from "@/components/icons/icon-picker";
import {
  Button,
  canonicalizeTimeInputValue,
  FormField,
  Input,
  Modal,
  TimeInput,
  Tooltip,
} from "@/components/ui/primitives";
import {
  telegramChannelsApi,
  type TelegramChannelSelectOption,
  type TelegramChannelTimePost,
} from "@/lib/api";
import { patchTelegramChannelCaches } from "@/lib/features/telegram/telegram-channel-cache";
import { telegramChannelKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import { useI18n } from "@/providers/i18n-provider";
import { TelegramCardMenuAction } from "./telegram-card-actions-menu";

type TimePostDraft = TelegramChannelTimePost;

function newTimePost(index: number): TimePostDraft {
  return {
    id: `draft-${Date.now()}-${index}`,
    title: "",
    time: "17:00",
    iconId: null,
    iconPresentation: null,
  };
}

function timePostsPayload(timePosts: TimePostDraft[]) {
  return timePosts.map((item) => ({
    title: item.title.trim(),
    time: canonicalizeTimeInputValue(item.time) ?? item.time,
    iconId: item.iconId || null,
  }));
}

function reconcileTimePosts(
  queryClient: ReturnType<typeof useQueryClient>,
  channel: Awaited<ReturnType<typeof telegramChannelsApi.updateQuiet>>,
) {
  patchTelegramChannelCaches(queryClient, channel);
  queryClient.setQueriesData<TelegramChannelSelectOption[]>(
    { queryKey: telegramChannelKeys.selects() },
    (channels) =>
      channels?.map((item) =>
        item.id === channel.id
          ? { ...item, timePosts: channel.timePosts || [] }
          : item,
      ),
  );
}

function TimePostEditor({
  item,
  onChange,
  onRemove,
}: {
  item: TimePostDraft;
  onChange: (patch: Partial<TimePostDraft>) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/20 p-3">
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_140px_auto]">
        <div className="flex items-end">
          <IconPicker
            compact
            iconId={item.iconId || null}
            icon={item.iconPresentation || null}
            onChange={(iconId) =>
              onChange({ iconId: iconId || null, iconPresentation: null })
            }
            buttonLabel={t("telegram.posts.time.pickIcon")}
          />
        </div>
        <FormField label={t("telegram.posts.time.title")}>
          <Input
            value={item.title}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder={t("telegram.posts.time.optionalLabel")}
          />
        </FormField>
        <FormField label={t("telegram.posts.time.time")}>
          <TimeInput
            value={item.time}
            onChange={(event) => onChange({ time: event.target.value })}
          />
        </FormField>
        <div className="flex items-end">
          <Button
            type="button"
            variant="secondary"
            className="h-10 px-3"
            onClick={onRemove}
            aria-label={t("telegram.posts.time.remove")}
          >
            <Trash2 size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TimePostsControl({
  channelId,
  timePosts,
  presentation = "button",
}: {
  channelId: string;
  timePosts: TelegramChannelTimePost[];
  presentation?: "button" | "menu";
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draftTimePosts, setDraftTimePosts] = useState<TimePostDraft[]>(timePosts);
  const saveMutation = useMutation({
    mutationFn: (nextTimePosts: TimePostDraft[]) =>
      telegramChannelsApi.updateQuiet(channelId, {
        timePosts: timePostsPayload(nextTimePosts),
      }),
    onSuccess: (channel) => {
      reconcileTimePosts(queryClient, channel);
      pushToast(t("telegram.posts.time.saved"), "success");
      setOpen(false);
    },
    onError: () => pushToast(t("telegram.posts.time.saveError"), "error"),
  });

  const invalid = draftTimePosts.some(
    (item) => !canonicalizeTimeInputValue(item.time),
  );

  return (
    <>
      {presentation === "menu" ? (
        <TelegramCardMenuAction
          label={t("telegram.posts.time.menu")}
          icon={<Clock3 size={15} />}
          onClick={() => {
            setDraftTimePosts(timePosts);
            setOpen(true);
          }}
        />
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
          setDraftTimePosts(timePosts);
          setOpen(true);
          }}
        >
          <span className="inline-flex items-center gap-2">
            <Clock3 size={15} />
            {t("telegram.posts.time.menu")}
          </span>
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("telegram.posts.time.manageTitle")}
      >
        <div className="space-y-4">
          <p className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3 text-sm text-neutral-300">
            {t("telegram.posts.time.description")}
          </p>
          <div className="space-y-3">
            {draftTimePosts.map((item, index) => (
              <TimePostEditor
                key={item.id}
                item={item}
                onChange={(patch) =>
                  setDraftTimePosts((current) =>
                    current.map((currentItem, currentIndex) =>
                      currentIndex === index
                        ? { ...currentItem, ...patch }
                        : currentItem,
                    ),
                  )
                }
                onRemove={() =>
                  setDraftTimePosts((current) =>
                    current.filter((_, currentIndex) => currentIndex !== index),
                  )
                }
              />
            ))}
            {!draftTimePosts.length ? (
              <div className="rounded-lg border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">
                {t("telegram.posts.time.empty")}
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setDraftTimePosts((current) => [...current, newTimePost(current.length)])
              }
            >
              <span className="inline-flex items-center gap-2">
                <Plus size={15} />
                {t("telegram.posts.time.add")}
              </span>
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={saveMutation.isPending || invalid}
                onClick={() => saveMutation.mutate(draftTimePosts)}
              >
                {saveMutation.isPending ? t("common.saving") : t("telegram.posts.time.save")}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function AddTimePostButton({
  channelId,
  timePosts,
  className,
  presentation = "default",
}: {
  channelId: string;
  timePosts: TelegramChannelTimePost[];
  className?: string;
  presentation?: "default" | "editor" | "calendar";
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TimePostDraft>(() => newTimePost(0));
  const saveMutation = useMutation({
    mutationFn: () =>
      telegramChannelsApi.updateQuiet(channelId, {
        timePosts: timePostsPayload([...timePosts, draft]),
      }),
    onSuccess: (channel) => {
      reconcileTimePosts(queryClient, channel);
      pushToast(t("telegram.posts.time.added"), "success");
      setOpen(false);
      setDraft(newTimePost(0));
    },
    onError: () => pushToast(t("telegram.posts.time.addError"), "error"),
  });
  const invalid = !canonicalizeTimeInputValue(draft.time);
  const openModal = () => setOpen(true);
  const button =
    presentation === "editor" ? (
      <Tooltip content={t("telegram.posts.time.addAccessible")}>
        <Button
          type="button"
          aria-label={t("telegram.posts.time.addAccessible")}
          className={`!grid h-9 w-9 shrink-0 !place-items-center !p-0 leading-none bg-blue-600 hover:bg-blue-500 ${className ?? ""}`}
          onClick={openModal}
        >
          <Plus size={22} strokeWidth={2.75} className="!h-[22px] !w-[22px]" />
        </Button>
      </Tooltip>
    ) : (
      <Button
        type="button"
        variant="secondary"
        className={
          presentation === "calendar"
            ? `h-10 shrink-0 px-2.5 text-xs ${className ?? ""}`
            : className
        }
        onClick={openModal}
      >
        <span className="inline-flex items-center gap-1.5">
          <Plus size={presentation === "calendar" ? 14 : 15} />
          {presentation === "calendar" ? t("telegram.posts.time.add") : t("telegram.posts.time.addNew")}
        </span>
      </Button>
    );

  return (
    <>
      {button}
      <Modal open={open} onClose={() => setOpen(false)} title={t("telegram.posts.time.addTitle")}>
        <div className="space-y-4">
          <TimePostEditor
            item={draft}
            onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            onRemove={() => setDraft(newTimePost(0))}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={saveMutation.isPending || invalid}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? t("common.saving") : t("telegram.posts.time.add")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
