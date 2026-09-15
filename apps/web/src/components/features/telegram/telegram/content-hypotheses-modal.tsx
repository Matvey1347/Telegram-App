"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type {
  ResolvedEmoji,
  TelegramContentHypothesis,
  TelegramContentHypothesisInput,
  TelegramContentHypothesisStatus,
} from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { IconPicker } from "@/components/icons/icon-picker";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  FormField,
  Input,
  Modal,
  MultiSelect,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { telegramContentHypothesesApi } from "@/lib/api";
import { telegramContentHypothesisKeys } from "@/lib/query-keys";
import { useI18n } from "@/providers/i18n-provider";
import { useAppToast } from "@/providers/toast-provider";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
} from "./telegram-card-actions-menu";
import {
  CONTENT_HYPOTHESIS_STATUSES,
  CONTENT_HYPOTHESIS_STATUS_TONE,
} from "./content-hypothesis-status";

const emptyDraft = (): TelegramContentHypothesisInput => ({
  name: "",
  description: "",
  status: "ACTIVE",
  iconId: null,
});

function ContentHypothesisEditorModal({
  channelId,
  item,
  onClose,
}: {
  channelId: string;
  item: TelegramContentHypothesis | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { pushToast } = useAppToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TelegramContentHypothesisInput>(() =>
    item
      ? {
          name: item.name,
          description: item.description,
          status: item.status,
          conclusion: item.conclusion,
          iconId: item.iconId,
        }
      : emptyDraft(),
  );
  const [icon, setIcon] = useState<ResolvedEmoji | null>(
    item?.iconPresentation ?? null,
  );
  const [postIds, setPostIds] = useState(item?.postIds ?? []);
  const postOptions = useQuery({
    queryKey: telegramContentHypothesisKeys.postOptions(channelId),
    queryFn: () => telegramContentHypothesesApi.postOptions(channelId),
    enabled: false,
  });
  const save = useMutation({
    mutationFn: () =>
      item
        ? telegramContentHypothesesApi.update(channelId, item.id, {
            ...draft,
            postIds,
          })
        : telegramContentHypothesesApi.create(channelId, {
            ...draft,
            postIds,
          }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: telegramContentHypothesisKeys.list(channelId),
      });
      onClose();
    },
    onError: () => pushToast(t("telegram.posts.hypotheses.saveError"), "error"),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={
        item
          ? t("telegram.posts.hypotheses.edit")
          : t("telegram.posts.hypotheses.new")
      }
      size="md"
    >
      <div className="space-y-4">
        <FormField label={t("telegram.posts.hypotheses.icon")}>
          <IconPicker
            iconId={draft.iconId}
            icon={icon}
            allowImages={false}
            buttonLabel={t("telegram.posts.icon.addEmoji")}
            onChange={(iconId, presentation) => {
              setDraft((current) => ({ ...current, iconId }));
              setIcon(presentation ?? null);
            }}
          />
        </FormField>
        <FormField label={t("telegram.posts.hypotheses.name")} required>
          <Input
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
        </FormField>
        <FormField label={t("telegram.posts.hypotheses.description")}>
          <Textarea
            rows={5}
            value={draft.description ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </FormField>
        <FormField label={t("telegram.posts.hypotheses.status")}>
          <Select
            className={CONTENT_HYPOTHESIS_STATUS_TONE[draft.status ?? "ACTIVE"]}
            value={draft.status}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                status: event.target.value as TelegramContentHypothesisStatus,
              }))
            }
          >
            {CONTENT_HYPOTHESIS_STATUSES.map((status) => (
              <option
                key={status}
                value={status}
                className={`rounded-full border px-2 py-0.5 ${CONTENT_HYPOTHESIS_STATUS_TONE[status]}`}
              >
                {t(`telegram.posts.hypotheses.status.${status}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("telegram.posts.hypotheses.selectPosts")}>
          {postOptions.isError ? (
            <p className="text-sm text-rose-300">
              {t("telegram.posts.hypotheses.postsLoadError")}
            </p>
          ) : (
            <MultiSelect
              value={postIds}
              onChange={setPostIds}
              loading={postOptions.isFetching}
              loadingLabel={t("telegram.posts.hypotheses.loadingPosts")}
              onOpen={() => void postOptions.refetch()}
              options={(postOptions.data ?? []).map((post) => ({
                value: post.id,
                label: post.groupTitle
                  ? `${post.title} · ${post.groupTitle}`
                  : post.title,
              }))}
              placeholder={t(
                "telegram.posts.hypotheses.selectPostsPlaceholder",
              )}
            />
          )}
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!draft.name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {t("telegram.posts.hypotheses.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ContentHypothesesWorkspace({
  channelId,
}: {
  channelId: string;
}) {
  const { locale, t } = useI18n();
  const { pushToast } = useAppToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TelegramContentHypothesis | null>();
  const [deleting, setDeleting] = useState<TelegramContentHypothesis | null>(
    null,
  );
  const list = useQuery({
    queryKey: telegramContentHypothesisKeys.list(channelId),
    queryFn: () => telegramContentHypothesesApi.list(channelId),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      telegramContentHypothesesApi.remove(channelId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: telegramContentHypothesisKeys.list(channelId),
      });
      setDeleting(null);
    },
    onError: () =>
      pushToast(t("telegram.posts.hypotheses.deleteError"), "error"),
  });

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">
            {t("telegram.posts.hypotheses")}
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            {t("telegram.posts.hypotheses.subtitle")}
          </p>
        </div>
        <Button type="button" onClick={() => setEditing(null)}>
          <Plus size={16} /> {t("telegram.posts.hypotheses.new")}
        </Button>
      </div>
      {list.isLoading ? <p>{t("telegram.posts.hypotheses.loading")}</p> : null}
      {list.isError ? (
        <p className="text-rose-300">
          {t("telegram.posts.hypotheses.loadError")}
        </p>
      ) : null}
      {list.data?.length === 0 ? (
        <Card className="p-5 text-sm text-neutral-400">
          {t("telegram.posts.hypotheses.empty")}
        </Card>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.data?.map((item) => (
          <Card
            key={item.id}
            className={`p-4 transition hover:border-blue-700 ${CONTENT_HYPOTHESIS_STATUS_TONE[item.status]}`}
          >
            <div className="flex items-start gap-3">
              <IconAvatar icon={item.iconPresentation} label={item.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{item.name}</p>
                <span
                  className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs ${CONTENT_HYPOTHESIS_STATUS_TONE[item.status]}`}
                >
                  {t(`telegram.posts.hypotheses.status.${item.status}`)}
                </span>
              </div>
              <TelegramCardActionsMenu
                label={t("telegram.posts.hypotheses.actionsNamed", {
                  name: item.name,
                })}
              >
                <TelegramCardMenuAction
                  label={t("telegram.posts.hypotheses.edit")}
                  icon={<Pencil size={16} />}
                  onClick={() => setEditing(item)}
                />
                <TelegramCardMenuAction
                  label={t("telegram.posts.hypotheses.delete")}
                  icon={<Trash2 size={16} />}
                  onClick={() => setDeleting(item)}
                  danger
                />
              </TelegramCardActionsMenu>
            </div>
            {item.description ? (
              <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-neutral-400">
                {item.description}
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <HypothesisMetric
                label={t("telegram.posts.hypotheses.linkedPosts")}
                value={item.metrics.linkedPosts}
              />
              <HypothesisMetric
                label={t("telegram.posts.hypotheses.publishedPosts")}
                value={item.metrics.publishedPosts}
              />
              <HypothesisMetric
                label={t("telegram.posts.hypotheses.averageViews")}
                value={formatMetric(item.metrics.averageViews, locale)}
              />
              <HypothesisMetric
                label={t("telegram.posts.hypotheses.reactionRate")}
                value={formatPercent(item.metrics.averageReactionRate, locale)}
              />
              <HypothesisMetric
                label={t("telegram.posts.hypotheses.commentRate")}
                value={formatPercent(item.metrics.averageCommentRate, locale)}
              />
              <HypothesisMetric
                label={t("telegram.posts.hypotheses.forwardRate")}
                value={formatPercent(item.metrics.averageForwardRate, locale)}
              />
              <HypothesisMetric
                className="col-span-2"
                label={t("telegram.posts.hypotheses.subscriberDeltaLabel")}
                value={formatSignedMetric(
                  item.metrics.observedSubscriberDelta,
                  locale,
                )}
              />
            </div>
          </Card>
        ))}
      </div>
      {editing !== undefined ? (
        <ContentHypothesisEditorModal
          channelId={channelId}
          item={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      <ConfirmDeleteModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        entityName={deleting?.name ?? ""}
        label={deleting?.name ?? ""}
        description={t("telegram.posts.hypotheses.delete")}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </section>
  );
}

function HypothesisMetric({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2 ${className}`}
    >
      <p className="text-neutral-500">{label}</p>
      <p className="mt-0.5 font-semibold text-white">{value}</p>
    </div>
  );
}

function formatMetric(
  value: number | null,
  locale: string,
  maximumFractionDigits = 1,
) {
  return value == null
    ? "—"
    : new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

function formatPercent(value: number | null, locale: string) {
  return value == null ? "—" : `${formatMetric(value, locale, 2)}%`;
}

function formatSignedMetric(value: number | null, locale: string) {
  if (value == null) return "—";
  return new Intl.NumberFormat(locale, {
    signDisplay: "always",
    maximumFractionDigits: 0,
  }).format(value);
}
