"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CirclePlus } from "lucide-react";
import type { TelegramInviteLink } from "@/lib/api";
import { telegramChannelsApi } from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";
import { Button, CustomSelect, FormError, FormField, Input } from "@/components/ui/primitives";

/** Creates a Telegram invite link with a channel-authorized MTProto account. */
export function TelegramInviteLinkCreateInline({
  channelId,
  onCreated,
  open: controlledOpen,
  onOpenChange,
}: {
  channelId: string;
  onCreated: (link: TelegramInviteLink) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [title, setTitle] = useState("");
  const [accountId, setAccountId] = useState("");
  const sources = useQuery({
    queryKey: [...telegramChannelKeys.sources(), channelId],
    queryFn: () => telegramChannelsApi.sources(channelId),
    enabled: open && Boolean(channelId),
    staleTime: 30_000,
  });
  const accounts = [...new Map(
    (sources.data ?? [])
      .filter(
        (source) =>
          source.sourceType === "MTPROTO" &&
          source.permissions.canManageInviteLinks,
      )
      .map((source) => [source.sourceId, source]),
  ).values()];
  useEffect(() => {
    if (!accountId && accounts[0]?.sourceId) setAccountId(accounts[0].sourceId);
  }, [accountId, accounts]);
  const create = useMutation({
    mutationFn: () =>
      telegramChannelsApi.createInviteLink(channelId, {
        title: title.trim(),
        ...(accountId ? { mtprotoAccountId: accountId } : {}),
      }),
    onSuccess: async (link) => {
      await queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.inviteLinks(channelId),
      });
      onCreated(link);
      setTitle("");
      setOpen(false);
    },
  });

  if (!open && controlledOpen === undefined) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={!channelId}
        onClick={() => setOpen(true)}
      >
        <CirclePlus size={15} /> Create a new invite link
      </Button>
    );
  }

  if (!open) return null;

  return (
    <div className="space-y-3 rounded-lg border border-blue-900/60 bg-blue-950/20 p-3">
      <p className="text-sm font-medium text-blue-100">Create invite link in Telegram</p>
      <FormField label="Link name" required>
        <Input
          value={title}
          maxLength={32}
          placeholder="e.g. Mutual promotion October"
          onChange={(event) => setTitle(event.target.value)}
          disabled={create.isPending}
        />
      </FormField>
      <FormField label="MTProto account" required>
        <CustomSelect
          value={accountId}
          onChange={setAccountId}
          disabled={sources.isLoading || create.isPending || !accounts.length}
          placeholder={sources.isLoading ? "Loading accounts…" : "Select MTProto account"}
          options={accounts.map((account) => ({
            value: account.sourceId,
            label: account.displayName,
            meta: account.permissions.canManageInviteLinks
              ? "Can manage invite links"
              : undefined,
            iconUrl: account.avatarUrl ?? undefined,
            iconFallback: account.displayName,
          }))}
        />
      </FormField>
      {sources.isError ? <FormError message="Could not load MTProto accounts for this channel." /> : null}
      {!sources.isLoading && !sources.isError && !accounts.length ? (
        <FormError message="No connected MTProto account can manage invite links for this channel." />
      ) : null}
      {create.isError ? <FormError message="Telegram could not create the invite link. Check the selected account's channel permissions and try again." /> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={create.isPending}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!title.trim() || !accountId || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Creating in Telegram…" : "Create and select"}
        </Button>
      </div>
    </div>
  );
}
