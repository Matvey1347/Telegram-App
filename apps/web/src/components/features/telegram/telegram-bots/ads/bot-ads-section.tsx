"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import type {
  BotAdLinkView,
  BotAdPromoView,
  BotAdsLinksPage,
  BotAdsPage,
  CreateBotAdPlacements,
} from "@telegram-system/shared";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  MasonryGrid,
} from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { PromoCard } from "@/components/features/growth/ad-campaigns/promo-card";
import dynamic from "next/dynamic";
import type { PromoFormPayload } from "@/components/features/growth/ad-campaigns/promo-form-modal";
import type { Promo } from "@/lib/api";
import {
  botAdsApi,
  type BotAdsApiScope,
} from "@/lib/features/telegram/bot-ads-api";
import { selectedWorkspaceDraftScope } from "@/lib/workspace-modal-drafts";
import { botAdsKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import { BotAdsTabs, BotAdPromoTabs, type BotAdsTab } from "./bot-ads-tabs";
import { BotAdCampaignDialog } from "./bot-ad-campaign-dialog";
import { requestErrorMessage } from "../../telegram/telegram-channels-workspace-utils";
import { BotAdCampaignSummary, BotAdLinks } from "./bot-ad-links";
import {
  BotAdLinkDialog,
  BotAdPublishDialog,
  type BotAdPlacementSeed,
} from "./bot-ad-placement-dialogs";

const PromoFormModal = dynamic(() =>
  import("@/components/features/growth/ad-campaigns/promo-form-modal").then(
    (module) => module.PromoFormModal,
  ),
);

const PAGE_SIZE = 50;
const emptyChannels: [] = [];

function editorPromo(promo: BotAdPromoView): Promo {
  return {
    ...promo,
    telegramChannelId: "",
    status: promo.archivedAt ? "archived" : "active",
  };
}

function PageControls({
  page,
  count,
  hasMore,
  onChange,
}: {
  page: number;
  count: number;
  hasMore: boolean;
  onChange: (page: number) => void;
}) {
  if (page === 1 && !hasMore) return null;
  return (
    <Pagination
      page={page}
      pageSize={PAGE_SIZE}
      totalItems={(page - 1) * PAGE_SIZE + count}
      totalPages={page + Number(hasMore)}
      hasPreviousPage={page > 1}
      hasNextPage={hasMore}
      cursorMode
      onPageChange={onChange}
      onPageSizeChange={() => {}}
    />
  );
}

export function BotAdsSection({ botId, environment }: BotAdsApiScope) {
  const scope = { botId, environment };
  const workspace = selectedWorkspaceDraftScope();
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [tab, setTab] = useState<BotAdsTab>("promos");
  const [state, setState] = useState<"active" | "archive">("active");
  const [promoPage, setPromoPage] = useState(1);
  const [linkPage, setLinkPage] = useState(1);
  const [filter, setFilter] = useState<{ id: string; title: string }>();
  const [campaignId, setCampaignId] = useState<string>();
  const [campaignSeed, setCampaignSeed] = useState<BotAdPlacementSeed>();
  const [editor, setEditor] = useState<BotAdPromoView | "new">();
  const [linkSeed, setLinkSeed] = useState<BotAdPlacementSeed>();
  const [publication, setPublication] = useState<BotAdLinkView>();

  const initialPromo = useMemo(
    () => (editor && editor !== "new" ? editorPromo(editor) : undefined),
    [editor],
  );
  const promoKey = botAdsKeys.promos(workspace, botId, environment);
  const linkKey = botAdsKeys.links(workspace, botId, environment);
  const promos = useQuery({
    queryKey: [...promoKey, state, promoPage],
    queryFn: () => botAdsApi.promos(scope, state, (promoPage - 1) * PAGE_SIZE),
    enabled: tab === "promos",
  });
  const kind = tab === "placements" ? "placement" : "link";
  const links = useQuery({
    queryKey: [
      ...linkKey,
      kind,
      filter?.id ?? null,
      campaignId ?? null,
      linkPage,
    ],
    queryFn: () =>
      botAdsApi.links(scope, (linkPage - 1) * PAGE_SIZE, {
        kind,
        promoId: filter?.id,
        campaignId,
      }),
    enabled: tab !== "promos",
  });
  const channelKind = campaignSeed ? "placement" : "link";
  const channelOptions = useQuery({
    queryKey: botAdsKeys.channels(workspace, botId, environment, channelKind),
    queryFn: () => botAdsApi.channels(scope, channelKind),
    enabled: Boolean(campaignSeed || linkSeed),
  });
  const promoOptions = useQuery({
    queryKey: botAdsKeys.placementPromos(workspace, botId, environment),
    queryFn: () => botAdsApi.placementPromos(scope),
    enabled: Boolean(campaignSeed),
  });
  const save = useMutation({
    mutationFn: ({ payload, id }: { payload: PromoFormPayload; id?: string }) =>
      botAdsApi.savePromo(
        scope,
        {
          title: payload.title,
          text: payload.text,
          plainText: payload.plainText,
          formattedHtml: payload.formattedHtml,
          imageUrls: payload.imageUrls,
          mediaItems: payload.mediaItems,
          buttonRows: payload.buttonRows,
          iconId: payload.iconId,
        },
        id,
      ),
    onSuccess: (item, { id }) => {
      if (id) {
        queryClient.setQueriesData<BotAdsPage<BotAdPromoView>>(
          { queryKey: promoKey },
          (page) =>
            page && {
              ...page,
              items: page.items.map((row) => (row.id === item.id ? item : row)),
            },
        );
        queryClient.setQueriesData<BotAdsLinksPage>(
          { queryKey: linkKey },
          (page) =>
            page && {
              ...page,
              items: page.items.map((row) =>
                row.promo?.id === item.id
                  ? { ...row, promo: { id: item.id, title: item.title } }
                  : row,
              ),
            },
        );
      } else {
        setPromoPage(1);
        setState("active");
        void queryClient.invalidateQueries({
          queryKey: [...promoKey, "active"],
        });
      }
      void queryClient.invalidateQueries({
        queryKey: botAdsKeys.placementPromos(workspace, botId, environment),
      });
      setEditor(undefined);
    },
  });
  const archive = useMutation({
    mutationFn: (promo: BotAdPromoView) => botAdsApi.archivePromo(scope, promo),
    onSuccess: () => {
      setPromoPage(1);
      void queryClient.invalidateQueries({ queryKey: promoKey });
      void queryClient.invalidateQueries({
        queryKey: botAdsKeys.placementPromos(workspace, botId, environment),
      });
    },
    onError: () => pushToast("Could not update the promo archive.", "error"),
  });
  const createLink = useMutation({
    mutationFn: (input: Parameters<typeof botAdsApi.createLink>[1]) =>
      botAdsApi.createLink(scope, input),
    onSuccess: () => {
      setLinkSeed(undefined);
      openTab("links");
      void queryClient.invalidateQueries({ queryKey: linkKey });
    },
  });
  const createCampaign = useMutation({
    mutationFn: (input: CreateBotAdPlacements) =>
      botAdsApi.createPlacements(scope, input),
    onSuccess: (_, input) => {
      openTab("placements", undefined, input.campaignId);
      void queryClient.invalidateQueries({ queryKey: linkKey });
    },
  });
  const publish = useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt?: string }) =>
      botAdsApi.publish(scope, id, scheduledAt),
    onSuccess: (item) => {
      setPublication(undefined);
      queryClient.setQueriesData<BotAdsLinksPage>(
        { queryKey: linkKey },
        (page) =>
          page && {
            ...page,
            items: page.items.map((row) => (row.id === item.id ? item : row)),
          },
      );
      void queryClient.invalidateQueries({ queryKey: linkKey });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: linkKey }),
  });

  function openTab(
    value: BotAdsTab,
    promo?: { id: string; title: string },
    campaign?: string,
  ) {
    setFilter(promo);
    setCampaignId(campaign);
    setLinkPage(1);
    setTab(value);
  }
  function startCampaign(seed: BotAdPlacementSeed = {}) {
    createCampaign.reset();
    setCampaignSeed(seed);
  }
  function startLink(seed: BotAdPlacementSeed) {
    createLink.reset();
    setLinkSeed(seed);
  }

  return (
    <section className="space-y-4" aria-label="Bot advertising">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BotAdsTabs value={tab} onChange={openTab} />
        {tab === "promos" ? (
          <Button type="button" onClick={() => setEditor("new")}>
            Create promo
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={links.isFetching}
              onClick={() => void links.refetch()}
            >
              <RefreshCw /> Refresh analytics
            </Button>
            {tab === "placements" ? (
              <Button type="button" onClick={() => startCampaign()}>
                Create campaign
              </Button>
            ) : (
              <Button type="button" onClick={() => startLink({})}>
                Create invite link
              </Button>
            )}
          </div>
        )}
      </div>

      {tab === "promos" ? (
        <>
          <BotAdPromoTabs
            value={state}
            onChange={(value) => {
              setState(value);
              setPromoPage(1);
            }}
          />
          {promos.isPending ? (
            <LoadingState />
          ) : promos.isError ? (
            <ErrorState text="Could not load bot promos. Check the selected bot environment." />
          ) : promos.data.items.length ? (
            <MasonryGrid className="xl:grid-cols-3">
              {promos.data.items.map((promo) => (
                <PromoCard
                  key={promo.id}
                  promo={editorPromo(promo)}
                  onEdit={() => setEditor(promo)}
                  onToggleArchive={
                    archive.isPending ? undefined : () => archive.mutate(promo)
                  }
                  botActions={{
                    onPlace: promo.archivedAt
                      ? undefined
                      : () => startCampaign({ promo }),
                    onAnalytics: () => openTab("placements", promo),
                  }}
                />
              ))}
            </MasonryGrid>
          ) : (
            <EmptyState
              text={
                state === "archive"
                  ? "No archived promos."
                  : "No active promos yet."
              }
            />
          )}
          {promos.data ? (
            <PageControls
              page={promoPage}
              count={promos.data.items.length}
              hasMore={promos.data.hasMore}
              onChange={setPromoPage}
            />
          ) : null}
        </>
      ) : (
        <>
          {filter || campaignId ? (
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-medium">
                {filter
                  ? `Placements for ${filter.title}`
                  : "Campaign placements"}
              </h2>
              <Button
                type="button"
                variant="secondary"
                onClick={() => openTab("placements")}
              >
                All placements
              </Button>
            </div>
          ) : null}
          {links.isPending ? (
            <LoadingState />
          ) : links.isError ? (
            <ErrorState text="Could not load bot link analytics." />
          ) : (
            <>
              {links.data.totals ? (
                <BotAdCampaignSummary totals={links.data.totals} />
              ) : null}
              <BotAdLinks
                links={links.data.items}
                placements={tab === "placements"}
                onCampaign={
                  campaignId
                    ? undefined
                    : (id) => openTab("placements", undefined, id)
                }
                onPublish={(link) => {
                  publish.reset();
                  setPublication(link);
                }}
                onNewLink={(link) => {
                  const seed = {
                    title: link.title,
                    channelId: link.channel?.id,
                    promo: link.promo ?? undefined,
                  };
                  if (link.promo) startCampaign(seed);
                  else startLink(seed);
                }}
              />
              <PageControls
                page={linkPage}
                count={links.data.items.length}
                hasMore={links.data.hasMore}
                onChange={setLinkPage}
              />
            </>
          )}
        </>
      )}
      {editor ? (
        <PromoFormModal
          open
          title={initialPromo ? "Edit promo" : "Create promo"}
          initial={initialPromo}
          channels={emptyChannels}
          saving={save.isPending}
          botAdsScope={`${botId}:${environment}`}
          onClose={() => setEditor(undefined)}
          onSubmit={async (payload) => {
            await save.mutateAsync({ payload, id: initialPromo?.id });
          }}
        />
      ) : null}
      {linkSeed ? (
        <BotAdLinkDialog
          seed={linkSeed}
          channels={channelOptions.data ?? []}
          loading={channelOptions.isPending}
          channelsError={channelOptions.isError}
          pending={createLink.isPending}
          error={
            createLink.error
              ? requestErrorMessage(
                  createLink.error,
                  "Could not create a link.",
                )
              : undefined
          }
          onClose={() => setLinkSeed(undefined)}
          onSave={createLink.mutate}
        />
      ) : null}
      {campaignSeed ? (
        <BotAdCampaignDialog
          seed={campaignSeed}
          workspaceId={workspace}
          botScope={`${botId}:${environment}`}
          promos={promoOptions.data ?? []}
          channels={channelOptions.data ?? []}
          pending={createCampaign.isPending}
          loading={channelOptions.isPending || promoOptions.isPending}
          failed={channelOptions.isError || promoOptions.isError}
          error={
            createCampaign.error
              ? requestErrorMessage(
                  createCampaign.error,
                  "Could not create the campaign.",
                )
              : undefined
          }
          onClose={() => setCampaignSeed(undefined)}
          onSave={async (input) => {
            await createCampaign.mutateAsync(input);
          }}
        />
      ) : null}
      {publication ? (
        <BotAdPublishDialog
          link={publication}
          pending={publish.isPending}
          error={publish.error?.message}
          onClose={() => setPublication(undefined)}
          onPublish={(id, scheduledAt) => publish.mutate({ id, scheduledAt })}
        />
      ) : null}
    </section>
  );
}
