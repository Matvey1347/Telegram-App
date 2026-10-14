"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CirclePlus } from "lucide-react";
import type { TelegramInviteLink, TelegramInviteLinkOption } from "@/lib/api";
import { telegramChannelsApi } from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";
import {
  Button,
  CustomSelect,
  DateInput,
  FormError,
  FormField,
  Input,
  TimeInput,
  ToggleRow,
} from "@/components/ui/primitives";

const timeLimitPresets = [
  { label: "1 hour", milliseconds: 60 * 60 * 1000 },
  { label: "1 week", milliseconds: 7 * 24 * 60 * 60 * 1000 },
  { label: "1 month", milliseconds: 30 * 24 * 60 * 60 * 1000 },
  { label: "Unlimited", milliseconds: null },
] as const;
const userLimitPresets = [1, 10, 50, 100, null] as const;

function localDateParts(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

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
  const [requestNeeded, setRequestNeeded] = useState(true);
  const [monthlyFeeEnabled, setMonthlyFeeEnabled] = useState(false);
  const [monthlyFeeStars, setMonthlyFeeStars] = useState("");
  const [timeLimitPreset, setTimeLimitPreset] = useState(3);
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryTime, setExpiryTime] = useState("");
  const [userLimitPreset, setUserLimitPreset] = useState(4);
  const [usageLimit, setUsageLimit] = useState("");
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
        requestNeeded,
        ...(accountId ? { mtprotoAccountId: accountId } : {}),
        ...(timeLimitPreset < 3 && expiryDate && expiryTime
          ? { expiresAt: new Date(`${expiryDate}T${expiryTime}`).toISOString() }
          : {}),
        ...(userLimitPreset < 4 && Number(usageLimit) > 0
          ? { usageLimit: Number(usageLimit) }
          : {}),
        ...(monthlyFeeEnabled && Number(monthlyFeeStars) > 0
          ? { monthlyFeeStars: Number(monthlyFeeStars) }
          : {}),
    }),
    onSuccess: (link) => {
      // The create response is authoritative. Select it immediately instead
      // of waiting for an invite-link collection refresh.
      queryClient.setQueryData<TelegramInviteLinkOption[]>(
        telegramChannelKeys.inviteLinkInitial(channelId, link.id),
        [link],
      );
      onCreated(link);
      setTitle("");
      setOpen(false);
      void queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.inviteLinks(channelId),
        refetchType: "none",
      });
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

  const hasInvalidEnabledNumber =
    (monthlyFeeEnabled && Number(monthlyFeeStars) < 1) ||
    (userLimitPreset < 4 && Number(usageLimit) < 1);
  const selectTimeLimitPreset = (nextPreset: number) => {
    setTimeLimitPreset(nextPreset);
    const duration = timeLimitPresets[nextPreset]?.milliseconds;
    if (!duration) return;
    const parts = localDateParts(new Date(Date.now() + duration));
    setExpiryDate(parts.date);
    setExpiryTime(parts.time);
  };
  const selectUserLimitPreset = (nextPreset: number) => {
    setUserLimitPreset(nextPreset);
    const value = userLimitPresets[nextPreset];
    if (value) setUsageLimit(String(value));
  };
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
      <ToggleRow
        checked={requestNeeded}
        onChange={setRequestNeeded}
        activeTone="blue"
        label="Request admin approval"
        description="People join only after an administrator approves their request."
      />
      <ToggleRow
        checked={monthlyFeeEnabled}
        onChange={setMonthlyFeeEnabled}
        activeTone="blue"
        label="Require monthly fee"
        description="Charge a Telegram Stars subscription to join through this link."
      />
      {monthlyFeeEnabled ? (
        <FormField label="Monthly fee (Telegram Stars)" required>
          <Input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={monthlyFeeStars}
            onChange={(event) => setMonthlyFeeStars(event.target.value)}
            disabled={create.isPending}
            placeholder="Telegram validates its current maximum"
          />
        </FormField>
      ) : null}
      <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
        <div>
          <p className="text-sm font-medium text-white">Limit by time period</p>
          <p className="mt-1 text-sm text-neutral-400">Unlimited by default. Choose a preset, then refine its date and time.</p>
        </div>
        <input
          type="range"
          min="0"
          max="3"
          step="1"
          value={timeLimitPreset}
          onChange={(event) => selectTimeLimitPreset(Number(event.target.value))}
          aria-label="Invite link time limit"
          className="w-full accent-blue-500"
        />
        <div className="grid grid-cols-4 text-center text-xs text-neutral-300">
          {timeLimitPresets.map((preset) => <span key={preset.label}>{preset.label}</span>)}
        </div>
        {timeLimitPreset < 3 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Expiry date" required>
              <DateInput value={expiryDate} min={localDateParts(new Date()).date} onChange={(event) => setExpiryDate(event.target.value)} disabled={create.isPending} />
            </FormField>
            <FormField label="Expiry time" required>
              <TimeInput value={expiryTime} onChange={(event) => setExpiryTime(event.target.value)} disabled={create.isPending} />
            </FormField>
          </div>
        ) : null}
      </section>
      <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
        <div>
          <p className="text-sm font-medium text-white">Limit by number of users</p>
          <p className="mt-1 text-sm text-neutral-400">Unlimited by default. Choose a preset or enter an exact count.</p>
        </div>
        <input
          type="range"
          min="0"
          max="4"
          step="1"
          value={userLimitPreset}
          onChange={(event) => selectUserLimitPreset(Number(event.target.value))}
          aria-label="Invite link user limit"
          className="w-full accent-blue-500"
        />
        <div className="grid grid-cols-5 text-center text-xs text-neutral-300">
          {userLimitPresets.map((preset) => <span key={String(preset)}>{preset ?? "Unlimited"}</span>)}
        </div>
        {userLimitPreset < 4 ? (
          <FormField label="Number of users" required>
          <Input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={usageLimit}
            onChange={(event) => setUsageLimit(event.target.value)}
            disabled={create.isPending}
            placeholder="Telegram validates its current maximum"
          />
          </FormField>
        ) : null}
      </section>
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
          disabled={
            !title.trim() ||
            !accountId ||
            create.isPending ||
            hasInvalidEnabledNumber ||
            (timeLimitPreset < 3 && (!expiryDate || !expiryTime))
          }
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Creating in Telegram…" : "Create and select"}
        </Button>
      </div>
    </div>
  );
}
