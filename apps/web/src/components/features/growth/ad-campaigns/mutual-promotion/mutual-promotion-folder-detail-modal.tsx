"use client";

import { useState } from "react";
import {
  CalendarClock,
  Pencil,
  Play,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import type {
  MutualPromotionExpensePayload,
  MutualPromotionFolderDetail,
  UpdateMutualPromotionPostPayload,
} from "@telegram-system/shared";
import type { Account } from "@/lib/api";
import { formatDateTime } from "@/lib/date-format";
import { formatMoney } from "@/lib/features/finance/money";
import {
  Button,
  CustomSelect,
  EmptyState,
  FormError,
  FormField,
  Input,
  Modal,
} from "@/components/ui/primitives";
import { MutualPromotionPostImport } from "./mutual-promotion-post-import";
import { MutualPromotionSavedPostCard } from "./mutual-promotion-saved-post-card";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramInviteLinkCreatorAvatar } from "@/components/features/telegram/telegram/telegram-invite-link-creator-avatar";
import { inviteLinkCreatorFallback } from "@/lib/features/telegram/telegram-invite-link-creator";
import { MutualPromotionFolderStatusBadge } from "./mutual-promotion-folder-status-badge";
import { MutualPromotionAttributionChart } from "./mutual-promotion-attribution-chart";
import { MutualPromotionParticipantRoleBadge } from "./mutual-promotion-participant-role-badge";

function Count({ value }: { value: number | null }) {
  return <>{value == null ? "—" : new Intl.NumberFormat().format(value)}</>;
}

function ExpenseEditor({
  participantId,
  accounts,
  initialAccountId,
  initialAmount,
  saving,
  onSave,
}: {
  participantId: string;
  accounts: Account[];
  initialAccountId: string;
  initialAmount: number | null;
  saving: boolean;
  onSave: (
    participantId: string,
    payload: MutualPromotionExpensePayload,
  ) => Promise<void>;
}) {
  const [accountId, setAccountId] = useState(initialAccountId);
  const [amount, setAmount] = useState(
    initialAmount == null ? "" : String(initialAmount),
  );
  const validAmount = Number(amount) > 0;
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-end">
      <FormField label="Expense account">
        <CustomSelect
          value={accountId}
          onChange={setAccountId}
          placeholder="Select account"
          options={accounts.map((account) => ({
            value: account.id,
            label: account.name,
            meta: account.currency,
            iconPresentation: account.iconPresentation ?? undefined,
            iconFallback: account.name,
          }))}
        />
      </FormField>
      <FormField label="Expense">
        <Input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </FormField>
      <Button
        type="button"
        variant="secondary"
        disabled={saving || !accountId || !validAmount}
        onClick={() =>
          void onSave(participantId, {
            accountId,
            amount: Number(amount),
          }).catch(() => undefined)
        }
      >
        {saving ? "Saving…" : "Save expense"}
      </Button>
    </div>
  );
}

export function MutualPromotionFolderDetailModal({
  open,
  folder,
  timezone,
  accounts,
  botConnected,
  botUsername,
  mutating,
  actionError,
  onClose,
  onEdit,
  onEditInviteLinks,
  onActivate,
  onCancel,
  onAddPost,
  onUpdatePost,
  onRemovePost,
  onSaveExpense,
}: {
  open: boolean;
  folder: MutualPromotionFolderDetail | null;
  timezone: string;
  accounts: Account[];
  botConnected: boolean;
  botUsername: string | null;
  mutating: boolean;
  actionError: string | null;
  onClose: () => void;
  onEdit: () => void;
  onEditInviteLinks: () => void;
  onActivate: () => Promise<void>;
  onCancel: () => Promise<void>;
  onAddPost: Parameters<typeof MutualPromotionPostImport>[0]["onAddPost"];
  onUpdatePost: (
    postId: string,
    payload: UpdateMutualPromotionPostPayload,
  ) => Promise<void>;
  onRemovePost: (postId: string) => Promise<void>;
  onSaveExpense: (
    participantId: string,
    payload: MutualPromotionExpensePayload,
  ) => Promise<void>;
}) {
  if (!folder) return null;
  const editable = folder.status === "DRAFT";
  const canActivate =
    editable &&
    folder.postCount >= 5 &&
    folder.publisherCount > 0 &&
    folder.participantCount > 0;
  const previewChannel =
    folder.participants.find((participant) => participant.role === "PUBLISHER")
      ?.channel ?? folder.participants[0]?.channel;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={folder.title}
      size="xl"
      headerAction={<MutualPromotionFolderStatusBadge status={folder.status} />}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
          <div className="space-y-1 text-sm text-neutral-300">
            <p className="inline-flex items-center gap-2">
              <CalendarClock size={16} /> {formatDateTime(folder.startsAt)} —{" "}
              {formatDateTime(folder.endsAt)}
            </p>
            <p className="inline-flex items-center gap-2">
              <Users size={16} /> {folder.publisherCount} publisher(s),{" "}
              {folder.paidCount} paid
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable ? (
              <Button type="button" variant="secondary" onClick={onEdit}>
                <Pencil size={16} /> Edit setup
              </Button>
            ) : null}
            {["SCHEDULED", "ACTIVE"].includes(folder.status) ? (
              <Button
                type="button"
                variant="secondary"
                onClick={onEditInviteLinks}
                disabled={mutating}
              >
                <Pencil size={16} /> Edit invite links
              </Button>
            ) : null}
            {["SCHEDULED", "ACTIVE"].includes(folder.status) ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => void onCancel().catch(() => undefined)}
                disabled={mutating}
              >
                Cancel folder
              </Button>
            ) : null}
          </div>
        </div>

        {editable && !canActivate ? (
          <p className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-200">
            Activation requires at least five publications and one publishing
            channel.
          </p>
        ) : null}
        <FormError message={actionError ?? undefined} />

        {editable ? (
          <MutualPromotionPostImport
            folderId={folder.id}
            timezone={timezone}
            startsAt={folder.startsAt}
            endsAt={folder.endsAt}
            botConnected={botConnected}
            botUsername={botUsername}
            previewChannelTitle={previewChannel?.title ?? folder.title}
            previewChannelPhotoUrl={previewChannel?.photoUrl}
            saving={mutating}
            onAddPost={onAddPost}
          />
        ) : null}

        <section className="space-y-3">
          <div>
            <h4 className="font-semibold text-white">
              Channels and attribution
            </h4>
            <p className="mt-1 text-sm text-neutral-400">
              Arrivals use invite-link counter boundaries. For publishers,
              unsubscribes are estimated when Telegram does not provide exact
              leave events.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {folder.participants.map((participant) => (
              <div
                key={participant.id}
                className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <IconAvatar
                      icon={
                        participant.channel.photoUrl
                          ? {
                              type: "image",
                              id: participant.channel.id,
                              url: participant.channel.photoUrl,
                            }
                          : null
                      }
                      label={participant.channel.title}
                      size="sm"
                      className="rounded-full"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">
                        {participant.channel.title}
                      </p>
                      <div className="mt-1 flex min-w-0 items-center gap-1.5">
                        <TelegramInviteLinkCreatorAvatar
                          photoUrl={participant.inviteLink.creatorPhotoUrl}
                          memberAvatar={
                            participant.inviteLink.creatorMember
                              ?.avatarPresentation
                          }
                          label={inviteLinkCreatorFallback(
                            participant.inviteLink,
                          )}
                        />
                        <a
                          href={participant.inviteLink.url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 truncate text-xs text-blue-300 hover:text-blue-200"
                        >
                          {participant.inviteLink.name}
                        </a>
                      </div>
                    </div>
                  </div>
                  <MutualPromotionParticipantRoleBadge
                    role={participant.role}
                  />
                </div>
                <dl
                  className={`mt-2 grid gap-2 text-sm ${
                    participant.role === "PAID" ? "grid-cols-1" : "grid-cols-3"
                  }`}
                >
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <UserPlus
                        size={14}
                        className="text-emerald-300"
                        aria-hidden="true"
                      />
                      Joined
                    </dt>
                    <dd className="mt-1 text-white">
                      <Count value={participant.stats.joinedCount} />
                      {participant.role === "PAID" ? (
                        <ParticipantUnitCost
                          value={participant.stats.subscriberPrice}
                          currency={participant.stats.currency}
                          label="paid subscriber"
                        />
                      ) : null}
                    </dd>
                  </div>
                  {participant.role === "PUBLISHER" ? (
                    <>
                      <div>
                        <dt className="flex items-center gap-1.5 text-xs text-neutral-500">
                          <UserMinus
                            size={14}
                            className="text-rose-300"
                            aria-hidden="true"
                          />
                          Unsubscribed
                          {participant.stats.unsubscribedIsEstimate ? " ≈" : ""}
                        </dt>
                        <dd className="mt-1 text-white">
                          <Count value={participant.stats.unsubscribedCount} />
                        </dd>
                      </div>
                      <div>
                        <dt className="flex items-center gap-1.5 text-xs text-neutral-500">
                          <UserRound
                            size={14}
                            className="text-violet-300"
                            aria-hidden="true"
                          />
                          Net audience
                        </dt>
                        <dd className="mt-1 text-white">
                          <Count value={participant.stats.audienceDelta} />
                        </dd>
                      </div>
                    </>
                  ) : null}
                </dl>
                <MutualPromotionAttributionChart
                  history={participant.attributionHistory}
                  showUnsubscribed={participant.role === "PUBLISHER"}
                />
                {participant.role === "PAID" ? (
                  <ExpenseEditor
                    key={`${participant.id}:${participant.expense?.transactionId ?? "new"}`}
                    participantId={participant.id}
                    accounts={accounts}
                    initialAccountId={participant.expense?.accountId ?? ""}
                    initialAmount={participant.expense?.amount ?? null}
                    saving={mutating}
                    onSave={onSaveExpense}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="font-semibold text-white">
                Publications ({folder.posts.length})
              </h4>
              <p className="mt-1 text-sm text-neutral-400">
                Each post is sent to every publishing channel.
              </p>
            </div>
          </div>
          {!folder.posts.length ? (
            <EmptyState text="No publications have been added yet." />
          ) : null}
          {folder.posts.map((post, index) => (
            <MutualPromotionSavedPostCard
              key={post.id}
              post={post}
              index={index}
              editable={editable}
              timezone={timezone}
              startsAt={folder.startsAt}
              endsAt={folder.endsAt}
              channelTitle={previewChannel?.title ?? folder.title}
              channelPhotoUrl={previewChannel?.photoUrl}
              saving={mutating}
              onSave={onUpdatePost}
              onRemove={onRemovePost}
            />
          ))}
        </section>

        {editable ? (
          <section className="rounded-xl border border-blue-900/70 bg-blue-950/20 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <CalendarClock
                  size={20}
                  className="mt-0.5 shrink-0 text-blue-300"
                />
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-blue-100">
                    What happens when you activate this folder
                  </p>
                  <p className="text-neutral-300">
                    Posts without inline buttons are added immediately to
                    Telegram Scheduled Messages in every 📣 Publisher channel.
                    Posts with inline buttons stay in our scheduler and are sent
                    at their selected time. 💳 Paid channels never publish.
                  </p>
                  <p className="text-xs text-neutral-400">
                    Activation locks the folder setup. Published messages are
                    removed automatically when the folder ends.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                className="shrink-0 sm:self-end"
                onClick={() => void onActivate().catch(() => undefined)}
                disabled={!canActivate || mutating}
              >
                <Play size={16} /> {mutating ? "Activating…" : "Activate"}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}

function ParticipantUnitCost({
  value,
  currency,
  label,
}: {
  value: number | null;
  currency: string | null;
  label: string;
}) {
  return (
    <span className="mt-1 block text-[11px] text-neutral-500">
      {value == null ? "—" : formatMoney(value, currency)} / {label}
    </span>
  );
}
