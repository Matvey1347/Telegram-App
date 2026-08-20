"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { telegramSystemBotApi } from "@/lib/api";
import { telegramSystemBotKeys } from "@/lib/query-keys";

export function TaskGroupNotificationSubscription({
  workspaceId,
  groupKey,
  taskKeys,
}: {
  workspaceId: string;
  groupKey: "TELEGRAM";
  taskKeys: string[];
}) {
  const queryClient = useQueryClient();
  const queryKey = telegramSystemBotKeys.subscriptions(workspaceId);
  const subscriptions = useQuery({
    queryKey,
    queryFn: () => telegramSystemBotApi.subscriptions(workspaceId),
  });
  const preferences = subscriptions.data?.items.filter((item) =>
    taskKeys.includes(item.taskKey),
  );
  const notifyOnSuccess = Boolean(
    preferences?.length &&
      preferences.every((item) => item.enabled && item.notifyOnSuccess),
  );
  const notifyOnFailure = Boolean(
    preferences?.length &&
      preferences.every((item) => item.enabled && item.notifyOnFailure),
  );
  const update = useMutation({
    mutationFn: (payload: {
      notifyOnSuccess: boolean;
      notifyOnFailure: boolean;
    }) =>
      telegramSystemBotApi.updateGroupSubscriptions({
        workspaceId,
        groupKey,
        ...payload,
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(queryKey, response);
    },
  });

  const save = (
    field: "notifyOnSuccess" | "notifyOnFailure",
    value: boolean,
  ) => {
    const nextNotifyOnSuccess =
      field === "notifyOnSuccess" ? value : notifyOnSuccess;
    const nextNotifyOnFailure =
      field === "notifyOnFailure" ? value : notifyOnFailure;
    update.mutate({
      notifyOnSuccess: nextNotifyOnSuccess,
      notifyOnFailure: nextNotifyOnFailure,
    });
  };

  return (
    <div className="mt-3 min-w-48 border-t border-neutral-800 pt-3">
      <p className="text-xs font-medium text-neutral-200">
        Telegram System Bot notifications for all Telegram syncs
      </p>
      {subscriptions.isLoading ? (
        <p className="mt-1 text-xs text-neutral-500">
          Loading recipient preferences…
        </p>
      ) : null}
      {subscriptions.isError ? (
        <div className="mt-1 text-xs text-rose-300">
          <p>Could not load your recipient preferences.</p>
          <button
            type="button"
            className="mt-1 underline underline-offset-2"
            onClick={() => void subscriptions.refetch()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {subscriptions.data && !subscriptions.data.connected ? (
        <div className="mt-1 text-xs text-amber-200">
          <p>Connection: Not connected</p>
          {subscriptions.data.botUsername ? (
            <a
              className="mt-2 inline-flex rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500"
              href={`https://t.me/${subscriptions.data.botUsername}?start=connect`}
              target="_blank"
              rel="noreferrer"
            >
              Connect
            </a>
          ) : (
            <span className="mt-1 block text-neutral-500">
              System Bot is not configured.
            </span>
          )}
        </div>
      ) : null}
      {subscriptions.data?.connected ? (
        <fieldset className="mt-2 space-y-1" disabled={update.isPending}>
          <legend className="text-xs text-emerald-300">
            Connection: Connected
          </legend>
          <span className="block text-xs text-neutral-500">Notify me:</span>
          <label className="flex items-center gap-2 text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={notifyOnSuccess}
              onChange={(event) =>
                save("notifyOnSuccess", event.target.checked)
              }
            />
            Success
          </label>
          <label className="flex items-center gap-2 text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={notifyOnFailure}
              onChange={(event) =>
                save("notifyOnFailure", event.target.checked)
              }
            />
            Failure
          </label>
          {update.isPending ? (
            <p className="text-xs text-neutral-500">Saving…</p>
          ) : null}
          {update.isError ? (
            <p className="text-xs text-rose-300">
              Could not save your notification preference. Try again.
            </p>
          ) : null}
          {preferences?.some(
            (item) =>
              item.notifyOnSuccess !== notifyOnSuccess ||
              item.notifyOnFailure !== notifyOnFailure,
          ) ? (
            <p className="text-xs text-amber-200">
              Some Telegram syncs have different preferences. Changing either
              option will apply it to all of them.
            </p>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}
