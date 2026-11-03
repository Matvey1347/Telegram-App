"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  TelegramAdProduct,
  TelegramAdSale,
} from "@telegram-system/shared";
import { ExternalLink, FileText, Link2 } from "lucide-react";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import {
  Button,
  CustomSelect,
  DateInput,
  FormField,
  Input,
  Select,
  TimeInput,
} from "@/components/ui/primitives";
import type { Account } from "@/lib/api";
import { LifecycleCountdown } from "@/components/ui/lifecycle-countdown";
import { accountDisplayName } from "@/lib/features/finance/account-display";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { placementTimer } from "./ad-placement-lifecycle";
import { CurrencyAmountInput } from "@/components/ui/currency-amount-input";
import { AdSalePlacementBotActions } from "./ad-sale-placement-bot-actions";
import {
  PlacementPostComposer,
  type PlacementManagedPostDraft,
} from "./placement-post/placement-post-composer";

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
  return <LifecycleCountdown value={timer} className="mt-2" />;
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
  onLoadPosts: () => Promise<PlacementPostOption[]>;
  onSave: (
    draft?: PlacementManagedPostDraft,
    attachment?: { telegramPostUrl?: string; telegramPostId?: string },
  ) => Promise<void>;
  saving: boolean;
  error: string;
  workspaceId?: string | null;
  systemBotUsername?: string | null;
  systemBotConnected?: boolean;
}) {
  const [postEditorOpen, setPostEditorOpen] = useState(
    () => !props.placement.managedPostId && !props.draft.telegramPostId,
  );
  const [postUrl, setPostUrl] = useState("");
  const [postSaving, setPostSaving] = useState(false);
  const [postError, setPostError] = useState("");
  const [postOptions, setPostOptions] = useState<PlacementPostOption[]>([]);
  const [postOptionsLoading, setPostOptionsLoading] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [postInputMode, setPostInputMode] = useState<"select" | "link">(
    "select",
  );
  const [managedPostDraft, setManagedPostDraft] =
    useState<PlacementManagedPostDraft | null>(() =>
      props.placement.managedPost
        ? {
            title: props.placement.managedPost.title,
            text: props.placement.managedPost.text ?? "",
            imageUrls: props.placement.managedPost.imageUrls ?? [],
            mediaItems: props.placement.managedPost.mediaItems,
            buttonRows: props.placement.managedPost.buttonRows ?? [],
          }
        : null,
    );
  const [creatingPost, setCreatingPost] = useState(Boolean(managedPostDraft));
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

  const openPostEditor = async (mode: "select" | "link") => {
    setCreatingPost(false);
    setPostEditorOpen(true);
    setPostInputMode(mode);
    setPostError("");
    if (mode !== "select" || postOptions.length || postOptionsLoading) return;
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
    if (creatingPost) {
      if (!managedPostDraft) {
        setPostError("Choose Write by hand or import a post from the bot.");
        return;
      }
      await props.onSave(managedPostDraft);
      return;
    }
    if (!postEditorOpen) {
      await props.onSave(managedPostDraft ?? undefined);
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
      await props.onSave(undefined, payload);
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
      <section className="border-y border-neutral-800 py-4 sm:rounded-xl sm:border sm:bg-neutral-950/45 sm:p-4">
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
          </FormField>
        </div>
      </section>
      <section className="border-y border-neutral-800 py-4 sm:rounded-xl sm:border sm:bg-neutral-950/45 sm:p-4">
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
          {hasLinkedPost ? (
            <Button
              variant="secondary"
              onClick={() => void openPostEditor("select")}
            >
              Change post
            </Button>
          ) : null}
        </div>
        <div
          className="mt-4 inline-grid grid-cols-3 rounded-md border border-neutral-700 bg-neutral-950 p-px"
          role="tablist"
          aria-label="Advertising post options"
        >
          {(["select", "link", "create"] as const).map((mode) => {
            const selected =
              mode === "create"
                ? creatingPost
                : !creatingPost && postInputMode === mode;
            const label =
              mode === "select"
                ? "Select post"
                : mode === "link"
                  ? "Paste link"
                  : "Create new post";
            return (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  if (mode === "create") {
                    setCreatingPost(true);
                    setPostEditorOpen(false);
                    setPostError("");
                  } else {
                    void openPostEditor(mode);
                  }
                }}
                className={`h-8 rounded-[5px] px-3 text-xs font-medium transition ${
                  selected
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {creatingPost ? (
          <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setManagedPostDraft(
                    (current) =>
                      current ?? {
                        title: "Advertising post",
                        text: "",
                        imageUrls: [],
                        buttonRows: [],
                      },
                  )
                }
              >
                {managedPostDraft ? "Continue writing" : "Write by hand"}
              </Button>
              <AdSalePlacementBotActions
                placementKey={props.placement.id}
                channelTitle={props.channelName}
                workspaceId={props.workspaceId}
                systemBotUsername={props.systemBotUsername}
                systemBotConnected={props.systemBotConnected}
                draft={managedPostDraft}
                onImported={(draft) => {
                  setManagedPostDraft(draft);
                  setCreatingPost(true);
                  setPostEditorOpen(false);
                  setPostError("");
                }}
              />
            </div>
          </div>
        ) : null}
        {postError ? (
          <p className="mt-3 text-sm text-rose-300" role="alert">
            {postError}
          </p>
        ) : null}
        {creatingPost && managedPostDraft ? (
          <div className="mt-4">
            <PlacementPostComposer
              channelTitle={props.channelName}
              channelPhotoUrl={props.channelPhotoUrl}
              draft={managedPostDraft}
              publishedPosts={[]}
              postsLoading={false}
              canCreate
              autoCreate={false}
              lockToDraft
              onLoadPublishedPosts={() => undefined}
              onChange={(next) => {
                if (next.draft) {
                  setManagedPostDraft(next.draft);
                  setCreatingPost(true);
                }
              }}
            />
          </div>
        ) : null}
        {postEditorOpen && !creatingPost ? (
          <div className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
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
          iconPresentation: a.iconPresentation ?? undefined,
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
      <FormField label="Amount">
        <CurrencyAmountInput
          aria-label={`Amount (${props.payment.currency})`}
          value={props.payment.amount}
          inputMode="decimal"
          currency={props.payment.currency}
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
