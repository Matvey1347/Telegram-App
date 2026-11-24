import { isAxiosError } from "axios";
import { CalendarClock, Pause } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TelegramAiPostingAutopilotState } from "@telegram-system/shared";
import { Button, Card } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { telegramAiPostingKeys } from "@/lib/query-keys";
import { useI18n } from "@/providers/i18n-provider";
import { AiPostingAutopilotActivity } from "./ai-posting-autopilot-activity";

export function AiPostingAutopilot({ channelId }: { channelId: string }) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const queryKey = telegramAiPostingKeys.autopilot(channelId);
  const endpoint = `/telegram-channels/${channelId}/ai-posting/autopilot`;
  const state = useQuery({
    queryKey,
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) =>
      (await api.get<TelegramAiPostingAutopilotState>(endpoint, { signal }))
        .data,
  });
  const update = useMutation({
    onMutate: () => client.cancelQueries({ queryKey, exact: true }),
    mutationFn: async (data: { enabled: boolean }) =>
      (await api.put<TelegramAiPostingAutopilotState>(endpoint, data)).data,
    onSuccess: (data) => {
      client.setQueryData(queryKey, data);
    },
  });
  const data = state.data;
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const date = (value: string | null) =>
    value ? dateFormat.format(new Date(value)) : "—";
  const updateCode = isAxiosError<{ message?: string }>(update.error)
    ? update.error.response?.data?.message
    : undefined;
  const updateError =
    updateCode === "AI_POSTING_AUTOPILOT_PROFILE_REQUIRED"
      ? t("telegram.posts.aiPostingAutopilot.profileRequired")
      : updateCode === "AI_POSTING_AUTOPILOT_PLAN_REQUIRED"
        ? t("telegram.posts.aiPostingAutopilot.noPlan")
        : t("telegram.posts.aiPostingAutopilot.updateError");
  return (
    <Card className="space-y-4 p-4">
      <div className="space-y-1">
        <h3 className="font-semibold">
          {t("telegram.posts.aiPostingAutopilot.tab")}
        </h3>
        <p className="text-sm text-neutral-400">
          {t("telegram.posts.aiPostingAutopilot.description")}
        </p>
      </div>
      {state.isPending ? (
        <p role="status" className="text-sm text-neutral-400">
          {t("telegram.posts.aiPostingAutopilot.loading")}
        </p>
      ) : null}
      {state.isError ? (
        <p role="alert" className="text-sm text-red-300">
          {t("telegram.posts.aiPostingAutopilot.loadError")}
        </p>
      ) : null}
      {data ? (
        <>
          <dl className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-800 p-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-neutral-400">
                {t("telegram.posts.aiPostingAutopilot.slots")}
              </dt>
              <dd>
                {data.weeklySlotsMin === data.weeklySlotsMax
                  ? data.weeklySlotsMax
                  : `${data.weeklySlotsMin}–${data.weeklySlotsMax}`}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-400">
                {t("telegram.posts.aiPostingAutopilot.stock")}
              </dt>
              <dd>
                {data.readyDrafts} / {data.targetReadyDrafts}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-400">
                {t("telegram.posts.aiPostingAutopilot.through")}
              </dt>
              <dd>{date(data.scheduledThrough)}</dd>
            </div>
          </dl>
          {data.lastError &&
          data.lastError !== "AI_AUTOMATIC_DISABLED" &&
          !data.history?.[0]?.errorCodes.length ? (
            <p className="break-words text-sm text-amber-200">{data.lastError}</p>
          ) : null}
          {!data.weeklySlotsMax ? (
            <p className="text-sm text-amber-200">
              {t("telegram.posts.aiPostingAutopilot.noPlan")}
            </p>
          ) : null}
          {update.isError ? (
            <p role="alert" className="text-sm text-red-300">
              {updateError}
            </p>
          ) : null}
          <Button
            disabled={
              update.isPending || (!data.enabled && !data.weeklySlotsMax)
            }
            onClick={() => update.mutate({ enabled: !data.enabled })}
          >
            {data.enabled ? (
              <Pause size={16} aria-hidden="true" />
            ) : (
              <CalendarClock size={16} aria-hidden="true" />
            )}
            {t(
              data.enabled
                ? "telegram.posts.aiPostingAutopilot.disable"
                : "telegram.posts.aiPostingAutopilot.enable",
            )}
          </Button>
          <AiPostingAutopilotActivity
            state={data}
            refreshing={state.isFetching || update.isPending}
            refresh={() => void state.refetch()}
            date={date}
          />
        </>
      ) : null}
    </Card>
  );
}
