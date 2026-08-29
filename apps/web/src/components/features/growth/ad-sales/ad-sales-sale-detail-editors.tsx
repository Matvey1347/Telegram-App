"use client";

import { useEffect, useMemo, useState } from "react";
import type { TelegramAdProduct, TelegramAdSale } from "@telegram-system/shared";
import { ExternalLink, FileText, Hourglass, Link2, Timer, Trash2 } from "lucide-react";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { Button, CustomSelect, DateInput, FormField, Input, Select, TimeInput } from "@/components/ui/primitives";
import type { Account } from "@/lib/api";
import { accountDisplayName } from "@/lib/features/finance/account-display";
import { toNumber } from "@/lib/features/growth/telegram-ad-sales";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { placementTimer } from "./ad-placement-lifecycle";
import { SaleStatusActions, type SaleActionKey } from "./sale-status-actions";

export type PlacementDraft = {
  id: string;
  date: string;
  time: string;
  timezone: string;
  agreedPrice: string;
  recommendedPrice: string;
  minimumPrice: string;
  manualPriceReason: string;
  telegramAdProductId: string;
  managedPostId: string;
  telegramPostId: string;
};

export type PlacementPostOption = {
  id: string;
  title: string;
  publishedAt: string;
};
export type PaymentDraft = {
  id: string;
  accountId: string;
  amount: string;
  currency: string;
  paidDate: string;
  paidTime: string;
  notes: string;
};

export function PlacementDeletionCountdown({
  placement,
  now: sharedNow,
}: {
  placement: TelegramAdSale["placements"][number];
  now?: number;
}) {
  const [localNow, setLocalNow] = useState(() => Date.now());
  useEffect(() => {
    if (sharedNow !== undefined || placement.deletedAt) return;
    const hasActiveTimer = placement.publishedAt
      ? Boolean(placement.plannedDeleteAt)
      : new Date(placement.scheduledAt).getTime() > Date.now();
    if (!hasActiveTimer) return;
    const timer = window.setInterval(() => setLocalNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [
    placement.deletedAt,
    placement.plannedDeleteAt,
    placement.publishedAt,
    placement.scheduledAt,
    sharedNow,
  ]);
  const now = sharedNow ?? localNow;
  const timer = placementTimer(placement, now);
  if (!timer) return null;
  return (
    <div className="mt-2 text-xs">
      <p
        className={`inline-flex items-center gap-1.5 font-mono font-medium tabular-nums ${timer.phase === "complete" ? "text-neutral-500" : timer.phase === "deletion" ? "text-amber-300" : "text-sky-400"}`}
      >
        {timer.phase === "complete" ? (
          <Trash2 size={13} aria-hidden="true" />
        ) : timer.phase === "deletion" ? (
          <Timer size={13} aria-hidden="true" />
        ) : (
          <Hourglass size={13} aria-hidden="true" />
        )}
        {timer.label}
      </p>
    </div>
  );
}

export function PlacementEditor(props: {
  sale: TelegramAdSale;
  placement: TelegramAdSale["placements"][number];
  draft: PlacementDraft;
  currency: string;
  channelName: string;
  channelPhotoUrl: string | null;
  products: TelegramAdProduct[];
  priceChanged: boolean;
  total: number;
  hasPayment: boolean;
  syncPayment: boolean;
  onSync: (v: boolean) => void;
  onChange: (p: Partial<PlacementDraft>) => void;
  onAction: (a: SaleActionKey) => Promise<void>;
  onAttachPost: (post: {
    telegramPostUrl?: string;
    telegramPostId?: string;
  }) => Promise<void>;
  onLoadPosts: () => Promise<PlacementPostOption[]>;
  onSave: () => Promise<void>;
  saving: boolean;
  error: string;
}) {
  const [postEditorOpen, setPostEditorOpen] = useState(false);
  const [postUrl, setPostUrl] = useState("");
  const [postSaving, setPostSaving] = useState(false);
  const [postError, setPostError] = useState("");
  const [postOptions, setPostOptions] = useState<PlacementPostOption[]>([]);
  const [postOptionsLoading, setPostOptionsLoading] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [postInputMode, setPostInputMode] = useState<"select" | "link">(
    "select",
  );
  const hasLinkedPost = Boolean(
    props.placement.managedPostId || props.draft.telegramPostId,
  );
  const systemPostUrl = props.placement.managedPostId
    ? buildTelegramPostsUrl({
        channelId: props.placement.telegramChannelId,
        postId: props.placement.managedPostId,
        postView: "editor",
      })
    : null;
  const telegramPostUrl =
    props.placement.telegramPostUrl ??
    props.placement.managedPost?.telegramMessageUrls[0] ??
    null;

  const openPostEditor = async () => {
    setPostEditorOpen((open) => !open);
    if (postEditorOpen || postOptions.length) return;
    setPostOptionsLoading(true);
    setPostError("");
    try {
      setPostOptions(await props.onLoadPosts());
    } catch (cause) {
      setPostError(
        cause instanceof Error ? cause.message : "Could not load posts.",
      );
    } finally {
      setPostOptionsLoading(false);
    }
  };

  const saveChanges = async () => {
    if (!postEditorOpen) {
      await props.onSave();
      return;
    }
    const payload =
      postInputMode === "link"
        ? postUrl.trim()
          ? { telegramPostUrl: postUrl.trim() }
          : null
        : selectedPostId
          ? { telegramPostId: selectedPostId }
          : null;
    if (!payload) {
      setPostError("Select a post or paste its Telegram link.");
      return;
    }
    setPostSaving(true);
    setPostError("");
    try {
      await props.onAttachPost(payload);
      await props.onSave();
      setPostUrl("");
      setSelectedPostId("");
      setPostEditorOpen(false);
    } catch (cause) {
      setPostError(
        cause instanceof Error ? cause.message : "Could not save post.",
      );
    } finally {
      setPostSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-neutral-800 bg-neutral-950/45 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <TelegramEntityAvatar
              imageUrl={props.channelPhotoUrl}
              kind="channel"
              alt={props.channelName}
              size="sm"
            />
            <h4 className="truncate font-semibold text-white">
              {props.channelName}
            </h4>
          </div>
          <SaleStatusActions
            sale={props.sale}
            placement={props.placement}
            onAction={props.onAction}
            hideSchedule
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <FormField label="Date">
            <DateInput
              value={props.draft.date}
              onChange={(e) => props.onChange({ date: e.target.value })}
            />
          </FormField>
          <FormField label="Time">
            <TimeInput
              value={props.draft.time}
              onChange={(e) => props.onChange({ time: e.target.value })}
            />
          </FormField>
          <FormField label="Format">
            <CustomSelect
              value={props.draft.telegramAdProductId}
              onChange={(v) => props.onChange({ telegramAdProductId: v })}
              options={[
                { value: "", label: "No format selected" },
                ...props.products.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </FormField>
          <FormField label={`Price (${props.currency})`}>
            <Input
              value={props.draft.agreedPrice}
              inputMode="decimal"
              onChange={(e) => props.onChange({ agreedPrice: e.target.value })}
            />
            <p className="mt-1.5 text-xs text-neutral-500">
              Recommended {props.draft.recommendedPrice} {props.currency} ·
              minimum {props.draft.minimumPrice} {props.currency}
            </p>
          </FormField>
          {toNumber(props.draft.agreedPrice) <
          toNumber(props.draft.minimumPrice) ? (
            <FormField label="Reason for price below minimum">
              <Input
                value={props.draft.manualPriceReason}
                onChange={(e) =>
                  props.onChange({ manualPriceReason: e.target.value })
                }
              />
            </FormField>
          ) : null}
        </div>
      </section>
      <section className="rounded-xl border border-neutral-800 bg-neutral-950/45 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {hasLinkedPost ? (
              <FileText size={20} className="text-blue-400" />
            ) : (
              <Link2 size={20} className="text-neutral-500" />
            )}
            <div>
              <h4 className="font-medium text-white">Advertising post</h4>
              <p className="text-sm text-neutral-500">
                {props.draft.telegramPostId
                  ? "Published post linked"
                  : props.placement.managedPostId
                    ? "Managed post linked"
                    : "No post linked yet"}
              </p>
              {hasLinkedPost ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {systemPostUrl ? (
                    <a
                      href={systemPostUrl}
                      className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline"
                    >
                      Open in system <ExternalLink size={12} />
                    </a>
                  ) : null}
                  {!props.placement.deletedAt && telegramPostUrl ? (
                    <a
                      href={telegramPostUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline"
                    >
                      Open in Telegram <ExternalLink size={12} />
                    </a>
                  ) : null}
                </div>
              ) : null}
              <PlacementDeletionCountdown placement={props.placement} />
              {props.placement.telegramPost ? (
                <p className="mt-2 text-xs text-neutral-400">
                  {props.placement.telegramPost.viewsCount ?? 0} views ·{" "}
                  {props.placement.telegramPost.reactionsCount ?? 0} reactions ·{" "}
                  {props.placement.telegramPost.commentsCount ?? 0} comments ·{" "}
                  {props.placement.telegramPost.forwardsCount ?? 0} forwards
                </p>
              ) : null}
            </div>
          </div>
          <Button variant="secondary" onClick={() => void openPostEditor()}>
            {postEditorOpen
              ? "Cancel"
              : hasLinkedPost
                ? "Change post"
                : "Add post"}
          </Button>
        </div>
        {postEditorOpen ? (
          <div className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
            <div className="inline-grid grid-cols-2 rounded-md border border-neutral-700 bg-neutral-950 p-px">
              {(["select", "link"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={postInputMode === mode}
                  onClick={() => {
                    setPostInputMode(mode);
                    setPostError("");
                  }}
                  className={`h-8 rounded-[5px] px-3 text-xs font-medium transition ${
                    postInputMode === mode
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                  }`}
                >
                  {mode === "select" ? "Select post" : "Paste link"}
                </button>
              ))}
            </div>
            {postInputMode === "select" ? (
              <FormField label="Published post">
                <Select
                  value={selectedPostId}
                  onChange={(event) => {
                    setSelectedPostId(event.target.value);
                    setPostError("");
                  }}
                  searchPlaceholder="Search all posts in this channel"
                >
                  <option value="">
                    {postOptionsLoading ? "Loading posts…" : "Select a post"}
                  </option>
                  {postOptions.map((post) => (
                    <option key={post.id} value={post.id}>
                      {post.title}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <FormField label="Telegram post link">
                <Input
                  value={postUrl}
                  onChange={(event) => {
                    setPostUrl(event.target.value);
                    setPostError("");
                  }}
                  placeholder="https://t.me/channel/123"
                  autoFocus
                />
              </FormField>
            )}
            {postError ? (
              <p className="text-sm text-rose-300">{postError}</p>
            ) : null}
          </div>
        ) : null}
      </section>
      {props.priceChanged && props.hasPayment ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-blue-900/60 bg-blue-950/25 p-4">
          <input
            type="checkbox"
            checked={props.syncPayment}
            onChange={(e) => props.onSync(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block font-medium text-blue-100">
              Update the finance transaction too
            </span>
            <span className="mt-1 block text-sm text-blue-200/70">
              Set the linked transaction to {props.total} {props.currency} and
              recalculate allocations.
            </span>
          </span>
        </label>
      ) : null}
      <SaveFooter
        error={props.error}
        saving={props.saving || postSaving}
        onSave={saveChanges}
      />
    </div>
  );
}

export function PaymentEditor(props: {
  payment: PaymentDraft;
  accounts: Account[];
  onChange: (p: Partial<PaymentDraft>) => void;
}) {
  const options = useMemo(
    () =>
      props.accounts
        .filter((a) => a.isActive || a.id === props.payment.accountId)
        .map((a) => ({
          value: a.id,
          label: `${accountDisplayName(a)} (${a.currency})`,
          iconUrl:
            a.iconPresentation?.type === "image"
              ? a.iconPresentation.url
              : undefined,
          iconEmoji:
            a.iconPresentation?.type === "unicode"
              ? a.iconPresentation.value
              : undefined,
          iconFallback: a.name,
        })),
    [props.accounts, props.payment.accountId],
  );
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <FormField label="Account">
        <CustomSelect
          value={props.payment.accountId}
          onChange={(accountId) => {
            const account = props.accounts.find((a) => a.id === accountId);
            props.onChange({
              accountId,
              currency: account?.currency ?? props.payment.currency,
            });
          }}
          options={options}
          placeholder={
            options.length ? "Select account" : "No accounts available"
          }
        />
      </FormField>
      <FormField label={`Amount (${props.payment.currency})`}>
        <Input
          value={props.payment.amount}
          inputMode="decimal"
          onChange={(e) => props.onChange({ amount: e.target.value })}
        />
      </FormField>
      <FormField label="Paid date">
        <DateInput
          value={props.payment.paidDate}
          onChange={(e) => props.onChange({ paidDate: e.target.value })}
        />
      </FormField>
      <FormField label="Paid time">
        <TimeInput
          value={props.payment.paidTime}
          onChange={(e) => props.onChange({ paidTime: e.target.value })}
        />
      </FormField>
      <div className="md:col-span-2 lg:col-span-4">
        <FormField label="Notes">
          <Input
            value={props.payment.notes}
            onChange={(e) => props.onChange({ notes: e.target.value })}
          />
        </FormField>
      </div>
    </div>
  );
}

export function SaveFooter({
  error,
  saving,
  onSave,
}: {
  error: string;
  saving: boolean;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-4">
      <p className="text-sm text-rose-300">{error}</p>
      <Button onClick={() => void onSave()} disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

