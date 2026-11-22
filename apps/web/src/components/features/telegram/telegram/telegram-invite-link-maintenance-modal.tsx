"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, FormField, Modal, Select } from "@/components/ui/primitives";
import { telegramChannelsApi } from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";

type Result = Awaited<
  ReturnType<typeof telegramChannelsApi.refreshInactiveInviteLinks>
>;

export function TelegramInviteLinkMaintenanceModal({
  channelId,
  open,
  onClose,
  onAssignments,
}: {
  channelId: string;
  open: boolean;
  onClose: () => void;
  onAssignments: (assignments: Record<string, unknown>) => void;
}) {
  const client = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const sources = useQuery({
    queryKey: [...telegramChannelKeys.sources(), channelId],
    queryFn: () => telegramChannelsApi.sources(channelId),
    enabled: open,
    staleTime: 30_000,
  });
  const accounts = useMemo(
    () => [
      ...new Map(
        (sources.data ?? [])
          .filter(
            (source) =>
              source.sourceType === "MTPROTO" &&
              source.permissions.canManageInviteLinks,
          )
          .map((source) => [source.sourceId, source]),
      ).values(),
    ],
    [sources.data],
  );
  const accountId = accounts.some(
    (account) => account.sourceId === selectedAccountId,
  )
    ? selectedAccountId
    : (accounts[0]?.sourceId ?? "");
  const refresh = useMutation({
    mutationFn: () =>
      telegramChannelsApi.refreshInactiveInviteLinks(channelId, accountId),
    onSuccess: async (next) => {
      setResult(next);
      onAssignments(next.assignments);
      await Promise.all([
        client.invalidateQueries({
          queryKey: telegramChannelKeys.inviteLinks(channelId),
        }),
        client.invalidateQueries({
          queryKey: telegramChannelKeys.detail(channelId),
        }),
        client.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
        client.invalidateQueries({ queryKey: telegramChannelKeys.cardLists() }),
      ]);
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Refresh inactive invite links"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            disabled={
              !accountId ||
              !accounts.length ||
              refresh.isPending ||
              sources.isLoading
            }
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending ? "Checking links…" : "Check and refresh"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-400">
          Telegram will be checked for links assigned to this channel. Active
          links stay in place. Inactive links are recreated through the selected
          account; the public link allows direct joining and other links require
          a join request.
        </p>
        {sources.isError ? (
          <p role="alert" className="text-sm text-rose-300">
            Could not load connected accounts.
          </p>
        ) : null}
        {!sources.isLoading && !sources.isError && !accounts.length ? (
          <p className="text-sm text-amber-300">
            No connected MTProto account with invite-link access is available
            for this channel.
          </p>
        ) : null}
        {accounts.length ? (
          <FormField label="MTProto account">
            <Select
              value={accountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.sourceId} value={account.sourceId}>
                  {account.displayName}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
        {refresh.isError ? (
          <p role="alert" className="text-sm text-rose-300">
            Could not refresh the links. Check the account permissions and try
            again.
          </p>
        ) : null}
        {result ? (
          <div
            role="status"
            className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 text-sm"
          >
            <p className="font-medium text-neutral-100">
              Checked {result.checkedLinks} links · recreated{" "}
              {result.replacedLinks}
            </p>
            {result.unavailableLinks ? (
              <p className="mt-1 text-amber-300">
                {result.unavailableLinks} could not be verified and were left
                unchanged.
              </p>
            ) : null}
            {!result.replacedLinks && !result.unavailableLinks ? (
              <p className="mt-1 text-neutral-400">
                All assigned links are active.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
