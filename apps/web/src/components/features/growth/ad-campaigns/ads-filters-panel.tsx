"use client";

import type { Dispatch, SetStateAction } from "react";
import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import { useI18n } from "@/providers/i18n-provider";
import { Card, DateRangeInput, FormField, Input } from "@/components/ui/primitives";
import { AdsChannelScopeFilter } from "./ads-channel-scope-filter";
import { AdCampaignSortMenu, type AdCampaignSort } from "./ad-campaign-sort-menu";

type AdsViewMode = "campaigns" | "hypotheses" | "promos";

export function AdsFiltersPanel({
  viewMode,
  networks,
  channels,
  onChannelScopeChange,
  search,
  setSearch,
  resetPage,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  sort,
  setSort,
}: {
  viewMode: AdsViewMode;
  networks: TelegramChannelNetwork[];
  channels: TelegramChannel[];
  onChannelScopeChange: (channelIds: string[]) => void;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  resetPage: () => void;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  sort: AdCampaignSort;
  setSort: (value: AdCampaignSort) => void;
}) {
  const { t } = useI18n();
  return (
    <Card className="mb-4">
      <div className={`grid min-w-0 gap-3 md:grid-cols-2 ${viewMode === "campaigns" ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)_auto] lg:items-end" : "lg:max-w-4xl"}`}>
        <AdsChannelScopeFilter
          networks={networks}
          channels={channels}
          onChange={(channelIds) => {
            onChannelScopeChange(channelIds);
            resetPage();
          }}
        />
        <label className="min-w-0 space-y-1">
          <span className="flex min-h-7 items-center text-sm text-neutral-300">{t("ads.search")}</span>
          <Input
            className="h-[42px]"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetPage();
            }}
            placeholder={
              viewMode === "campaigns"
                ? t("ads.campaign_search")
                : viewMode === "promos"
                  ? t("ads.promo_search")
                  : t("ads.hypothesis_search")
            }
          />
        </label>
        {viewMode === "campaigns" ? (
          <div className="min-w-0">
            <FormField label={t("ads.period")}>
              <DateRangeInput
                from={dateFrom}
                to={dateTo}
                onChange={(range) => {
                  setDateFrom(range.from);
                  setDateTo(range.to);
                  resetPage();
                }}
              />
            </FormField>
          </div>
        ) : null}
        {viewMode === "campaigns" ? (
          <div className="space-y-1 justify-self-start md:justify-self-end">
            <span className="flex min-h-7 items-center text-sm opacity-0" aria-hidden="true">{t("ads.sort_by")}</span>
            <AdCampaignSortMenu
              value={sort}
              onChange={(value) => {
                setSort(value);
                resetPage();
              }}
            />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
