import { type ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TelegramPublicationPlanCalendarEvent } from "@telegram-system/shared";
import {
  CalendarDays,
  ExternalLink,
  Megaphone,
  Repeat2,
} from "lucide-react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
} from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/date-format";
import { telegramAdSalesApi, telegramChannelsApi } from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";
import {
  crossPromotionPlanKeys,
  crossPromotionPlansApi,
} from "@/lib/features/growth/cross-promotion-plans-api";
import { telegramAdSalesKeys } from "@/lib/features/growth/telegram-ad-sales-query";

export function PublicationCalendarEventDetailsModal({
  event,
  onClose,
}: {
  event: TelegramPublicationPlanCalendarEvent | null;
  onClose: () => void;
}) {
  const channelsQuery = useQuery({
    queryKey: telegramChannelKeys.select(),
    queryFn: () => telegramChannelsApi.select(),
    enabled: Boolean(event),
    staleTime: 60_000,
  });
  const saleQuery = useQuery({
    queryKey: telegramAdSalesKeys.detail(event?.adSaleId ?? ""),
    queryFn: () => telegramAdSalesApi.getSale(event!.adSaleId!),
    enabled: Boolean(event?.adSaleId),
  });
  const plansQuery = useQuery({
    queryKey: crossPromotionPlanKeys.list("DIRECT_MUTUAL"),
    queryFn: () => crossPromotionPlansApi.list("DIRECT_MUTUAL"),
    enabled: Boolean(event?.crossPromotionPlanId),
    staleTime: 30_000,
  });
  const channelsById = useMemo(
    () => new Map((channelsQuery.data ?? []).map((channel) => [channel.id, channel])),
    [channelsQuery.data],
  );
  const plan = plansQuery.data?.find(
    (item) => item.id === event?.crossPromotionPlanId,
  );
  const loading = Boolean(event) &&
    (channelsQuery.isLoading || saleQuery.isLoading || plansQuery.isLoading);
  const error = saleQuery.isError || plansQuery.isError;

  return (
    <Modal
      open={Boolean(event)}
      onClose={onClose}
      title={event?.kind === "AD" ? "Advertising deal" : "Direct exchange"}
      size="xl"
    >
      {loading ? <LoadingState text="Loading publication details…" /> : null}
      {error ? (
        <ErrorState text="Could not load publication details. Try again from the calendar." />
      ) : null}
      {!loading && !error && event?.kind === "AD" && saleQuery.data ? (
        <AdSaleDetails sale={saleQuery.data} channelsById={channelsById} />
      ) : null}
      {!loading && !error && event?.kind === "VP" && plan ? (
        <DirectExchangeDetails plan={plan} channelsById={channelsById} />
      ) : null}
      {!loading && !error && event && !saleQuery.data && !plan ? (
        <EmptyState text="This publication is no longer available." />
      ) : null}
    </Modal>
  );
}

function AdSaleDetails({
  sale,
  channelsById,
}: {
  sale: Awaited<ReturnType<typeof telegramAdSalesApi.getSale>>;
  channelsById: Map<string, { title: string }>;
}) {
  return (
    <div className="space-y-5">
      <DetailHeader
        icon={<Megaphone size={18} />}
        title={sale.title?.trim() || sale.advertiserName}
        status={sale.status}
        meta={`${sale.totalAgreedAmount ?? "—"} ${sale.settlementCurrency}`}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailValue label="Buyer" value={sale.advertiserTelegram ?? sale.advertiserContact ?? sale.advertiserName} />
        <DetailValue label="Origin" value={sale.origin} />
      </div>
      <DetailSection title={`Placements · ${sale.placements.length}`}>
        {sale.placements.map((placement) => (
          <div key={placement.id} className="rounded-xl border border-neutral-800 bg-neutral-950/55 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {channelsById.get(placement.telegramChannelId)?.title ?? "Telegram channel"}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
                  <CalendarDays size={13} /> {formatDateTime(placement.scheduledAt)}
                </p>
              </div>
              <StatusPill value={placement.status} />
            </div>
            <p className="mt-2 text-xs text-neutral-400">
              {placement.agreedPrice} {placement.currency}
              {placement.managedPost?.title ? ` · ${placement.managedPost.title}` : ""}
            </p>
            {placement.telegramPostUrl ? (
              <a
                href={placement.telegramPostUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
              >
                Open published post <ExternalLink size={12} />
              </a>
            ) : null}
          </div>
        ))}
      </DetailSection>
    </div>
  );
}

function DirectExchangeDetails({
  plan,
  channelsById,
}: {
  plan: Awaited<ReturnType<typeof crossPromotionPlansApi.list>>[number];
  channelsById: Map<string, { title: string }>;
}) {
  const publisherChannels = plan.publisherChannelIds.map(
    (id) => channelsById.get(id)?.title ?? "Telegram channel",
  );
  const partnerChannels = plan.partnerChannelIds.map(
    (id) => channelsById.get(id)?.title ?? "Partner channel",
  );
  return (
    <div className="space-y-5">
      <DetailHeader
        icon={<Repeat2 size={18} />}
        title={plan.title}
        status={plan.status}
        meta={formatDateTime(plan.scheduledAt)}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <ChannelList title="My channels" channels={publisherChannels} />
        <ChannelList title="Partner channels" channels={partnerChannels} />
      </div>
      <DetailSection title={`Publications · ${plan.placementPostIds.length}`}>
        <div className="space-y-2">
          {plan.publisherResults.map((channel) => (
            <div key={channel.telegramChannelId} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950/55 px-3 py-2.5 text-sm">
              <span className="min-w-0 truncate text-neutral-100">{channel.title}</span>
              <span className="shrink-0 text-xs text-neutral-400">
                {channel.postViews == null ? "Views pending" : `${channel.postViews.toLocaleString()} views`}
              </span>
            </div>
          ))}
        </div>
      </DetailSection>
    </div>
  );
}

function DetailHeader({ icon, title, status, meta }: { icon: ReactNode; title: string; status: string; meta: string }) {
  return <div className="flex items-start justify-between gap-3 border-b border-neutral-800 pb-4"><div className="flex min-w-0 items-center gap-2 text-white">{icon}<h3 className="truncate text-lg font-semibold">{title}</h3></div><div className="shrink-0 text-right"><StatusPill value={status} /><p className="mt-1 text-xs text-neutral-400">{meta}</p></div></div>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section><h4 className="mb-2 text-sm font-semibold text-white">{title}</h4>{children}</section>;
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-neutral-800 bg-neutral-950/55 p-3"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 truncate text-sm text-neutral-100">{value}</p></div>;
}

function ChannelList({ title, channels }: { title: string; channels: string[] }) {
  return <DetailSection title={`${title} · ${channels.length}`}><div className="space-y-1.5">{channels.length ? channels.map((channel, index) => <p key={`${channel}:${index}`} className="truncate rounded-lg bg-neutral-950/55 px-3 py-2 text-sm text-neutral-200">{channel}</p>) : <p className="text-sm text-neutral-500">None</p>}</div></DetailSection>;
}

function StatusPill({ value }: { value: string }) {
  return <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-neutral-200">{value.replaceAll("_", " ")}</span>;
}
