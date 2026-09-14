"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, FormField, MultiSelect } from "@/components/ui/primitives";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { telegramContentHypothesesApi } from "@/lib/api";
import {
  telegramContentHypothesisKeys,
  telegramPostKeys,
} from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import { useI18n } from "@/providers/i18n-provider";

export function ManagedPostHypothesisSelector({
  channelId,
  postId,
  value,
}: {
  channelId: string;
  postId: string;
  value: string[];
}) {
  const { t } = useI18n();
  const { pushToast } = useAppToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(value);
  useEffect(() => setSelected(value), [value]);
  const hypotheses = useQuery({
    queryKey: telegramContentHypothesisKeys.list(channelId),
    queryFn: () => telegramContentHypothesesApi.list(channelId),
  });
  useEffect(() => {
    if (!hypotheses.data) return;
    setSelected(
      value.length
        ? value
        : hypotheses.data
            .filter((item) => item.postIds.includes(postId))
            .map((item) => item.id),
    );
  }, [hypotheses.data, postId, value]);
  const assign = useMutation({
    mutationFn: () =>
      telegramContentHypothesesApi.assignToPost(channelId, postId, {
        hypothesisIds: selected,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: telegramPostKeys.managedDetail(channelId, postId) }),
        queryClient.invalidateQueries({ queryKey: telegramContentHypothesisKeys.list(channelId) }),
      ]);
      pushToast(t("telegram.posts.hypotheses.assigned"), "success");
    },
    onError: () => pushToast(t("telegram.posts.hypotheses.saveError"), "error"),
  });
  if (hypotheses.isLoading)
    return (
      <p className="text-sm text-neutral-400">
        {t("telegram.posts.hypotheses.loading")}
      </p>
    );
  if (hypotheses.isError)
    return (
      <p className="text-sm text-rose-300">
        {t("telegram.posts.hypotheses.loadError")}
      </p>
    );
  if (!hypotheses.data?.length)
    return (
      <p className="text-sm text-neutral-400">
        {t("telegram.posts.hypotheses.empty")}
      </p>
    );
  return (
    <div className="space-y-2">
      <FormField label={t("telegram.posts.hypotheses.select")}>
        <MultiSelect
          value={selected}
          onChange={setSelected}
          options={hypotheses.data.map((item) => ({
            value: item.id,
            label: item.name,
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
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={assign.isPending}
          onClick={() => assign.mutate()}
        >
          {t("telegram.posts.hypotheses.assign")}
        </Button>
      </div>
    </div>
  );
}
