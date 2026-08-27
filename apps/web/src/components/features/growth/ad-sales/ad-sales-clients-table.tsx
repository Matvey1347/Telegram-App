"use client";

import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import {
  Button,
  EmptyState,
  FormField,
  Input,
  MasonryGrid,
  Modal,
  Textarea,
  Tooltip,
} from "@/components/ui/primitives";
import type { TelegramAdCrmAdvertiserListItem } from "@/lib/api";
import { formatDate as formatDisplayDate } from "@/lib/date-format";

const cardClass =
  "rounded-lg border border-neutral-800 bg-neutral-950 p-3 transition-colors";

export function AdSalesClientsTable({
  clients,
  overdueTaskCount,
  onUpdateClient,
  onOpenOrders,
}: {
  clients: TelegramAdCrmAdvertiserListItem[];
  overdueTaskCount: number;
  onUpdateClient?: (
    id: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  onOpenOrders?: (client: TelegramAdCrmAdvertiserListItem) => void;
}) {
  if (!clients.length) {
    return (
      <div>
        <EmptyState text="No clients matched the current filters." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {overdueTaskCount ? (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          {overdueTaskCount} client{overdueTaskCount === 1 ? "" : "s"} have
          overdue next tasks on this page.
        </div>
      ) : null}
      <MasonryGrid>
        {clients.map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            onUpdate={onUpdateClient}
            onOpenOrders={onOpenOrders}
          />
        ))}
      </MasonryGrid>
    </div>
  );
}

function ClientCard({
  client,
  onUpdate,
  onOpenOrders,
}: {
  client: TelegramAdCrmAdvertiserListItem;
  onUpdate?: (id: string, payload: Record<string, unknown>) => Promise<unknown>;
  onOpenOrders?: (client: TelegramAdCrmAdvertiserListItem) => void;
}) {
  const unspecified = isUnspecifiedClient(client);
  const [editing, setEditing] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const purchasedChannels = client.purchasedChannels ?? [];
  const telegramUsername = client.telegramUsername?.replace(/^@+/, "") || null;
  return (
    <article
      className={`${cardClass} ${unspecified ? "" : cardAccentClass(client)}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {!unspecified && telegramUsername ? (
            <TelegramEntityAvatar
              imageUrl={`https://t.me/i/userpic/320/${telegramUsername}.jpg`}
              alt={client.displayName}
              kind="person"
              size="sm"
            />
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-white">
                {!unspecified && telegramUsername ? (
                  <a
                    href={`https://t.me/${telegramUsername}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-sky-300 hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {client.displayName}
                  </a>
                ) : unspecified ? (
                  "No client"
                ) : (
                  client.displayName
                )}
              </h3>
              {!unspecified ? (
                <Pill
                  label={formatEnum(client.activityStatus ?? client.status)}
                  className={statusTone(client.activityStatus ?? client.status)}
                  description={statusDescription(
                    client.activityStatus ?? client.status,
                  )}
                />
              ) : null}
            </div>
            {!unspecified && client.companyName ? (
              <p className="mt-1 text-xs text-neutral-500">
                {client.companyName}
              </p>
            ) : null}
          </div>
        </div>
        {!unspecified && onUpdate ? (
          <button
            type="button"
            aria-label={`Edit ${client.displayName}`}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-900 hover:text-white"
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} />
          </button>
        ) : null}
      </div>

      {!unspecified && client.description ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-5 text-neutral-300">
          {client.description}
        </p>
      ) : null}

      {!unspecified || hasClientStats(client) ? (
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-neutral-900 pt-3 text-sm sm:grid-cols-4">
          <Metric
            label="Revenue"
            value={<NativeMoney amounts={client.revenueByCurrency} />}
          />
          <Metric
            label="Orders"
            value={
              onOpenOrders && client.totalSalesCount > 0 ? (
                <button
                  type="button"
                  className="rounded text-left text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label={`View ${client.totalSalesCount} orders for ${unspecified ? "No client" : client.displayName}`}
                  onClick={() => onOpenOrders(client)}
                >
                  {client.totalSalesCount}
                </button>
              ) : (
                String(client.totalSalesCount)
              )
            }
          />
          <Metric
            label="Paid"
            value={
              onOpenOrders && client.totalSalesCount > 0 ? (
                <button
                  type="button"
                  className="rounded text-left underline-offset-2 hover:text-sky-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label={`View paid orders for ${unspecified ? "No client" : client.displayName}`}
                  onClick={() => onOpenOrders(client)}
                >
                  {client.paidSalesCount ?? 0} / {client.totalSalesCount}
                </button>
              ) : (
                `${client.paidSalesCount ?? 0} / ${client.totalSalesCount}`
              )
            }
          />
          <Metric
            label="Placements"
            value={String(client.totalPlacementsCount ?? 0)}
          />
        </div>
      ) : null}

      {!unspecified ? (
        <div className="mt-3 border-t border-neutral-900 pt-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <OwnerRow owner={client.ownerMember} />
            {purchasedChannels.length ? (
              <button
                type="button"
                aria-label={`View channels purchased by ${client.displayName}`}
                onClick={() => setChannelsOpen(true)}
                className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-neutral-400 transition hover:bg-neutral-900 hover:text-white"
              >
                <span className="flex -space-x-2">
                  {purchasedChannels.slice(0, 3).map((channel) => (
                    <span
                      key={channel.id}
                      className="rounded-full bg-neutral-950 p-0.5"
                    >
                      <TelegramEntityAvatar
                        imageUrl={channel.photoUrl}
                        alt={channel.title}
                        kind="channel"
                        size="xs"
                      />
                    </span>
                  ))}
                </span>
                <span>
                  {purchasedChannels.length} channel
                  {purchasedChannels.length === 1 ? "" : "s"}
                </span>
              </button>
            ) : null}
          </div>
          {client.lastPurchaseAt ? (
            <InfoRow
              label="Last deal"
              value={formatDate(client.lastPurchaseAt)}
            />
          ) : null}
          {client.lastContactAt ? (
            <InfoRow
              label="Last contact"
              value={formatDate(client.lastContactAt)}
            />
          ) : null}
          {client.nextContactAt ? (
            <InfoRow
              label="Next contact"
              value={formatDate(client.nextContactAt)}
            />
          ) : null}
          {client.nextOpenTask ? (
            <InfoRow
              label="Next task"
              value={`${client.nextOpenTask.title} · ${formatEnum(client.nextOpenTask.type)} · ${formatDate(client.nextOpenTask.dueAt)}`}
            />
          ) : null}
          {client.lostReason || client.lostAt ? (
            <p className="mt-2 text-rose-300">
              Lost {formatDate(client.lostAt)}
              {client.lostReason ? `: ${client.lostReason}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}
      {editing && onUpdate ? (
        <ClientEditModal
          client={client}
          onClose={() => setEditing(false)}
          onSave={async (payload) => {
            await onUpdate(client.id, payload);
            setEditing(false);
          }}
        />
      ) : null}
      <Modal
        open={channelsOpen}
        onClose={() => setChannelsOpen(false)}
        title={`${client.displayName} · Channels`}
        size="sm"
      >
        <div className="space-y-2">
          {purchasedChannels.map((channel) => (
            <div
              key={channel.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3"
            >
              <TelegramEntityAvatar
                imageUrl={channel.photoUrl}
                alt={channel.title}
                kind="channel"
                size="sm"
              />
              <span className="min-w-0 truncate text-sm font-medium text-white">
                {channel.title}
              </span>
            </div>
          ))}
        </div>
      </Modal>
    </article>
  );
}

function ClientEditModal({
  client,
  onClose,
  onSave,
}: {
  client: TelegramAdCrmAdvertiserListItem;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [description, setDescription] = useState(client.description ?? "");
  const [companyName, setCompanyName] = useState(client.companyName ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [email, setEmail] = useState(client.email ?? "");
  const [website, setWebsite] = useState(client.website ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const telegramUsername = client.telegramUsername?.replace(/^@+/, "") || null;
  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="inline-flex min-w-0 items-center gap-2.5">
          <TelegramEntityAvatar
            imageUrl={
              telegramUsername
                ? `https://t.me/i/userpic/320/${telegramUsername}.jpg`
                : null
            }
            alt={client.displayName}
            kind="person"
            size="sm"
          />
          <span className="truncate">Client · {client.displayName}</span>
        </span>
      }
    >
      <div className="space-y-3">
        <FormField label="Description">
          <Textarea
            aria-label="Description"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Who this client is, interests, agreements and useful context"
          />
        </FormField>
        <FormField label="Company">
          <Input
            aria-label="Company"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Phone">
            <Input
              aria-label="Phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </FormField>
          <FormField label="Email">
            <Input
              aria-label="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>
        </div>
        <FormField label="Website">
          <Input
            aria-label="Website"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </FormField>
        {saveError ? (
          <p role="alert" className="text-sm text-rose-300">
            {saveError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setSaveError(null);
              onClose();
              try {
                await onSave({
                  description,
                  companyName,
                  phone,
                  email,
                  website,
                });
              } catch {
                setSaveError(
                  "Could not save client details. Please try again.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase text-neutral-500">{label}</p>
      <div className="mt-1 font-medium text-white">{value}</div>
    </div>
  );
}

function NativeMoney({
  amounts,
}: {
  amounts: TelegramAdCrmAdvertiserListItem["revenueByCurrency"];
}) {
  if (!amounts.length) return <span className="text-neutral-500">—</span>;
  return (
    <span className="flex flex-col gap-0.5 tabular-nums">
      {amounts.map((item) => (
        <span key={item.currency}>
          {formatAmount(item.amount)} {item.currency.toUpperCase()}
        </span>
      ))}
    </span>
  );
}

function formatAmount(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="shrink-0 text-neutral-500">{label}</span>
      <span className="min-w-0 truncate text-right text-neutral-300">
        {value}
      </span>
    </div>
  );
}

function OwnerRow({
  owner,
}: {
  owner: TelegramAdCrmAdvertiserListItem["ownerMember"];
}) {
  if (!owner) return <span className="text-neutral-500">Unassigned</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-neutral-300">
      <IconAvatar
        icon={owner.avatarPresentation}
        label={owner.name}
        size="xs"
      />
      <span className="min-w-0 truncate">{owner.name}</span>
    </span>
  );
}

function Pill({
  label,
  className,
  description,
}: {
  label: string;
  className: string;
  description?: string;
}) {
  const pill = (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
  return description ? (
    <Tooltip content={description} side="top" align="left">
      {pill}
    </Tooltip>
  ) : (
    pill
  );
}

function formatEnum(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return formatDisplayDate(value);
}

function isUnspecifiedClient(client: TelegramAdCrmAdvertiserListItem) {
  return (
    client.displayName.trim().toLowerCase() === "advertiser" &&
    !client.companyName &&
    !client.telegramUsername &&
    !client.primaryContact
  );
}

function hasClientStats(client: TelegramAdCrmAdvertiserListItem) {
  return (
    client.revenueByCurrency.some((item) => Number(item.amount) !== 0) ||
    Number(client.totalRevenueInPrimaryCurrency) > 0 ||
    Number(client.averageOrderValueInPrimaryCurrency) > 0 ||
    client.completedSalesCount > 0 ||
    client.totalSalesCount > 0 ||
    (client.totalPlacementsCount ?? 0) > 0 ||
    Boolean(client.lastPurchaseAt)
  );
}

function cardAccentClass(client: TelegramAdCrmAdvertiserListItem) {
  const urgency = String(client.urgency ?? "NONE").toUpperCase();
  if (urgency === "HIGH") return "border-amber-800/70";
  if (client.isHighValue) return "border-emerald-800/70";
  return "";
}

function statusTone(status: string) {
  if (status === "ACTIVE")
    return "border-emerald-700 bg-emerald-900/30 text-emerald-200";
  if (status === "LEAD") return "border-blue-700 bg-blue-900/30 text-blue-200";
  if (status === "WAITING")
    return "border-amber-700 bg-amber-900/30 text-amber-200";
  if (status === "LOST" || status === "BLOCKED")
    return "border-rose-700 bg-rose-900/30 text-rose-200";
  return "border-neutral-700 bg-neutral-900 text-neutral-300";
}

function statusDescription(status: string) {
  if (status === "LEAD") {
    return "Had a deal before, but has no active deal now.";
  }
  if (status === "ACTIVE") {
    return "An advertising post is published, still available in Telegram, and its deletion timer is running.";
  }
  if (status === "WAITING") {
    return "The client has an advertising placement waiting to be published.";
  }
  return undefined;
}
