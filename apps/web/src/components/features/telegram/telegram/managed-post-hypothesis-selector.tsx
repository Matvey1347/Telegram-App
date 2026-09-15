"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormField, MultiSelect } from "@/components/ui/primitives";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { telegramContentHypothesesApi } from "@/lib/api";
import {
  telegramContentHypothesisKeys,
  telegramPostKeys,
} from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import { useI18n } from "@/providers/i18n-provider";
import { CONTENT_HYPOTHESIS_STATUS_TONE } from "./content-hypothesis-status";

export function ManagedPostHypothesisSelector({
  channelId,
  postId,
  value,
  onChange,
}: {
  channelId: string;
  postId?: string | null;
  value: string[];
  onChange?: (value: string[]) => void;
}) {
  const { t } = useI18n();
  const { pushToast } = useAppToast();
  const queryClient = useQueryClient();
  const [optimisticSelection, setOptimisticSelection] = useState<{
    postId: string;
    ids: string[];
  } | null>(null);
  const hypotheses = useQuery({
    queryKey: telegramContentHypothesisKeys.list(channelId),
    queryFn: () => telegramContentHypothesesApi.list(channelId),
  });
  const persistedSelection =
    value.length || !postId
      ? value
      : (hypotheses.data ?? [])
          .filter((item) => item.postIds.includes(postId))
          .map((item) => item.id);
  const selected =
    optimisticSelection && optimisticSelection.postId === postId
      ? optimisticSelection.ids
      : persistedSelection;
  const assign = useMutation({
    mutationFn: (hypothesisIds: string[]) =>
      telegramContentHypothesesApi.assignToPost(channelId, postId!, {
        hypothesisIds,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedDetail(channelId, postId!),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramContentHypothesisKeys.list(channelId),
        }),
      ]);
      setOptimisticSelection(null);
      pushToast(t("telegram.posts.hypotheses.assigned"), "success");
    },
    onError: () => {
      setOptimisticSelection(null);
      pushToast(t("telegram.posts.hypotheses.saveError"), "error");
    },
  });
  if (hypotheses.isLoading)
    return (
      <FormField label={t("telegram.posts.editor.hypothesis")}>
        <MultiSelect
          value={[]}
          onChange={() => undefined}
          options={[]}
          disabled
          placeholder={t("telegram.posts.hypotheses.loading")}
        />
      </FormField>
    );
  if (hypotheses.isError)
    return (
      <FormField label={t("telegram.posts.editor.hypothesis")}>
        <p className="text-sm text-rose-300">
          {t("telegram.posts.hypotheses.loadError")}
        </p>
      </FormField>
    );
  if (!hypotheses.data?.length)
    return (
      <FormField label={t("telegram.posts.editor.hypothesis")}>
        <MultiSelect
          value={[]}
          onChange={() => undefined}
          options={[]}
          disabled
          placeholder={t("telegram.posts.hypotheses.empty")}
        />
      </FormField>
    );
  return (
    <FormField label={t("telegram.posts.editor.hypothesis")}>
      <MultiSelect
        value={selected}
        disabled={assign.isPending}
        onChange={(next) => {
          if (!postId) {
            onChange?.(next);
            return;
          }
          setOptimisticSelection({ postId, ids: next });
          assign.mutate(next);
        }}
        placeholder={t("telegram.posts.hypotheses.selectPlaceholder")}
        options={hypotheses.data.map((item) => ({
          value: item.id,
          label: item.name,
          badgeClassName: `rounded-full border px-2 py-0.5 ${CONTENT_HYPOTHESIS_STATUS_TONE[item.status]}`,
          icon: (
            <IconAvatar
              icon={item.iconPresentation}
              label={item.name}
              size="xs"
              decorative
            />
          ),
        }))}
      />
    </FormField>
  );
}
