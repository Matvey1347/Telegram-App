"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  TelegramContentHypothesis,
  TelegramContentHypothesisInput,
  TelegramContentHypothesisStatus,
} from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { telegramContentHypothesesApi } from "@/lib/api";
import { telegramContentHypothesisKeys } from "@/lib/query-keys";
import { useI18n } from "@/providers/i18n-provider";
import { useAppToast } from "@/providers/toast-provider";

const STATUSES: TelegramContentHypothesisStatus[] = [
  "DRAFT",
  "ACTIVE",
  "SUCCESSFUL",
  "FAILED",
  "ARCHIVED",
];
const emptyDraft = (): TelegramContentHypothesisInput => ({
  name: "",
  description: "",
  status: "DRAFT",
});

export function ContentHypothesesModal({
  channelId,
  onClose,
}: {
  channelId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { pushToast } = useAppToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] =
    useState<TelegramContentHypothesisInput>(emptyDraft);
  const list = useQuery({
    queryKey: telegramContentHypothesisKeys.list(channelId),
    queryFn: () => telegramContentHypothesesApi.list(channelId),
  });
  const save = useMutation({
    mutationFn: () =>
      editingId
        ? telegramContentHypothesesApi.update(channelId, editingId, draft)
        : telegramContentHypothesesApi.create(channelId, draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: telegramContentHypothesisKeys.list(channelId),
      });
      setEditingId(null);
      setDraft(emptyDraft());
    },
    onError: () => pushToast(t("telegram.posts.hypotheses.saveError"), "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      telegramContentHypothesesApi.remove(channelId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: telegramContentHypothesisKeys.list(channelId),
      });
      setEditingId(null);
      setDraft(emptyDraft());
    },
    onError: () =>
      pushToast(t("telegram.posts.hypotheses.deleteError"), "error"),
  });
  const edit = (item: TelegramContentHypothesis) => {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      description: item.description,
      status: item.status,
      conclusion: item.conclusion,
    });
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t("telegram.posts.hypotheses")}
      size="xl"
    >
      <p className="mb-4 text-sm text-neutral-400">
        {t("telegram.posts.hypotheses.subtitle")}
      </p>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-2">
          {list.isLoading ? (
            <p>{t("telegram.posts.hypotheses.loading")}</p>
          ) : null}
          {list.isError ? (
            <p className="text-rose-300">
              {t("telegram.posts.hypotheses.loadError")}
            </p>
          ) : null}
          {list.data?.length === 0 ? (
            <p className="text-neutral-400">
              {t("telegram.posts.hypotheses.empty")}
            </p>
          ) : null}
          {list.data?.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => edit(item)}
              className="flex w-full items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 text-left"
            >
              <IconAvatar icon={item.iconPresentation} label={item.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.name}</span>
                <span className="text-xs text-neutral-500">
                  {t(`telegram.posts.hypotheses.status.${item.status}`)} ·{" "}
                  {t("telegram.posts.hypotheses.posts", {
                    count: item.metrics.linkedPosts,
                  })}{" "}
                  ·{" "}
                  {t("telegram.posts.hypotheses.views", {
                    value: item.metrics.averageViews ?? "—",
                  })}
                </span>
                <span className="mt-1 grid grid-cols-2 gap-x-3 text-xs text-neutral-500">
                  <span>{t("telegram.posts.hypotheses.reactions", { value: item.metrics.averageReactionRate?.toFixed(2) ?? "—" })}</span>
                  <span>{t("telegram.posts.hypotheses.comments", { value: item.metrics.averageCommentRate?.toFixed(2) ?? "—" })}</span>
                  <span>{t("telegram.posts.hypotheses.forwards", { value: item.metrics.averageForwardRate?.toFixed(2) ?? "—" })}</span>
                  <span>{t("telegram.posts.hypotheses.subscriberDelta", { value: item.metrics.observedSubscriberDelta ?? "—" })}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setEditingId(null);
              setDraft(emptyDraft());
            }}
          >
            {t("telegram.posts.hypotheses.new")}
          </Button>
          <FormField label={t("telegram.posts.hypotheses.name")}>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </FormField>
          <FormField label={t("telegram.posts.hypotheses.description")}>
            <Textarea
              value={draft.description ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </FormField>
          <FormField label={t("telegram.posts.hypotheses.status")}>
            <Select
              value={draft.status}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  status: e.target.value as TelegramContentHypothesisStatus,
                })
              }
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`telegram.posts.hypotheses.status.${status}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="flex justify-between gap-2">
            {editingId ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => remove.mutate(editingId)}
              >
              {t("telegram.posts.hypotheses.delete")}
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              disabled={!draft.name.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {t("telegram.posts.hypotheses.save")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
