"use client";

import { LoaderCircle } from "lucide-react";
import { AdCampaignsTable } from "@/components/features/growth/ad-campaigns/campaigns-table";
import { InviteLinksTable } from "@/components/features/telegram/telegram/invite-links-table";
import { Pagination } from "@/components/ui/pagination";
import {
  FormField,
  Input,
  TableLoadingState,
} from "@/components/ui/primitives";
import { toNumber } from "./channel-analytics-format";
import { SectionToggle } from "./channel-analytics-primitives";
import { PostsTable } from "./channel-analytics-posts-table";
import type { useChannelAnalyticsQueries } from "./use-channel-analytics-queries";
import type { useChannelAnalyticsReport } from "./use-channel-analytics-report";
import type { useChannelAnalyticsMutations } from "./use-channel-analytics-mutations";

type AnalyticsQueries = ReturnType<typeof useChannelAnalyticsQueries>;
type AnalyticsReport = ReturnType<typeof useChannelAnalyticsReport>;
export function CampaignAttributionSection({
  queries,
  report,
}: {
  queries: Pick<
    AnalyticsQueries,
    | "data"
    | "openSections"
    | "setOpenSections"
    | "campaignsData"
    | "campaignsSearch"
    | "setCampaignsSearch"
    | "campaignsPagination"
    | "showCampaignsLoading"
    | "isCampaignsFetching"
    | "currencySettings"
    | "rates"
  >;
  report: Pick<AnalyticsReport, "campaignRows">;
}) {
  const {
    data,
    openSections,
    setOpenSections,
    campaignsData,
    campaignsSearch,
    setCampaignsSearch,
    campaignsPagination,
    showCampaignsLoading,
    isCampaignsFetching,
    currencySettings,
    rates,
  } = queries;
  const { campaignRows } = report;
  return (
    <>
      {toNumber(data?.summary?.campaignsCount) > 0 ? (
        <section className="mt-6">
          <SectionToggle
            title="Campaign Attribution"
            open={openSections.campaigns}
            onToggle={() =>
              setOpenSections((prev) => ({
                ...prev,
                campaigns: !prev.campaigns,
              }))
            }
          />
          {openSections.campaigns ? (
            <>
              <div className="mb-3 max-w-md">
                <FormField label="Search">
                  <Input
                    value={campaignsSearch}
                    onChange={(event) => setCampaignsSearch(event.target.value)}
                    placeholder="Campaign, promo, source, hypothesis"
                  />
                </FormField>
                {isCampaignsFetching ? (
                  <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-400">
                    <LoaderCircle size={14} className="animate-spin" />
                    Searching campaigns...
                  </div>
                ) : null}
              </div>
              {showCampaignsLoading ? (
                <TableLoadingState
                  text="Loading campaigns"
                  columns={6}
                  rows={
                    campaignsData?.items.length || campaignsPagination.pageSize
                  }
                />
              ) : null}
              {!showCampaignsLoading && campaignRows.length ? (
                <CampaignsTable
                  campaigns={campaignRows}
                  currencySettings={currencySettings}
                  rates={rates}
                />
              ) : null}
              {!showCampaignsLoading && !campaignRows.length ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-sm text-slate-300">
                  {campaignsSearch.trim()
                    ? "No campaigns found for this search."
                    : "No campaigns found."}
                </div>
              ) : null}
              {campaignsData?.pagination ? (
                <Pagination
                  {...campaignsData.pagination}
                  page={campaignsData.pagination.page}
                  pageSize={campaignsData.pagination.pageSize}
                  totalItems={campaignsData.pagination.totalItems}
                  totalPages={campaignsData.pagination.totalPages}
                  hasNextPage={campaignsData.pagination.hasNextPage}
                  hasPreviousPage={campaignsData.pagination.hasPreviousPage}
                  loading={showCampaignsLoading}
                  onPageChange={campaignsPagination.setPage}
                  onPageSizeChange={campaignsPagination.setPageSize}
                />
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
export function ChannelPostMetricsSection({
  queries,
  report,
  id,
  manualMetricsMutation,
}: {
  queries: Pick<
    AnalyticsQueries,
    | "data"
    | "openSections"
    | "setOpenSections"
    | "postsData"
    | "postsSearch"
    | "setPostsSearch"
    | "postsPagination"
    | "showPostsLoading"
    | "isPostsFetching"
    | "postsError"
  >;
  report: Pick<
    AnalyticsReport,
    "visiblePosts" | "computed" | "ownViewsPerPost" | "ownReactionsPerPost"
  >;
  id: string;
  manualMetricsMutation: ReturnType<
    typeof useChannelAnalyticsMutations
  >["manualMetricsMutation"];
}) {
  const {
    data,
    openSections,
    setOpenSections,
    postsData,
    postsSearch,
    setPostsSearch,
    postsPagination,
    showPostsLoading,
    isPostsFetching,
    postsError,
  } = queries;
  const { visiblePosts, computed, ownViewsPerPost, ownReactionsPerPost } =
    report;
  return (
    <>
      {openSections.posts || toNumber(data?.summary?.postsTotal) > 0 ? (
        <section className="mt-6">
          <SectionToggle
            title="All Posts Metrics"
            open={openSections.posts}
            onToggle={() =>
              setOpenSections((prev) => ({ ...prev, posts: !prev.posts }))
            }
          />
          {openSections.posts ? (
            <>
              <div className="mb-3 max-w-md">
                <FormField label="Search">
                  <Input
                    value={postsSearch}
                    onChange={(event) => setPostsSearch(event.target.value)}
                    placeholder="Post text or message ID"
                  />
                </FormField>
                {isPostsFetching ? (
                  <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-400">
                    <LoaderCircle size={14} className="animate-spin" />
                    Searching posts...
                  </div>
                ) : null}
              </div>
              {showPostsLoading ? (
                <TableLoadingState
                  text="Loading posts"
                  columns={8}
                  rows={postsData?.items.length || postsPagination.pageSize}
                />
              ) : null}
              {postsError ? (
                <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
                  Failed to load posts.
                </div>
              ) : null}
              {!showPostsLoading && !postsError && visiblePosts.length ? (
                <>
                  <PostsTable
                    channelId={id}
                    channelTitle={data?.channel?.title || "Telegram channel"}
                    channelPhotoUrl={data?.channel?.photoUrl || null}
                    posts={visiblePosts}
                    subscribers={computed.subscribers}
                    ownViewsPerPost={ownViewsPerPost}
                    ownReactionsPerPost={ownReactionsPerPost}
                    savingPostId={
                      manualMetricsMutation.isPending
                        ? manualMetricsMutation.variables?.postId
                        : null
                    }
                    onSaveManualMetrics={(postId, payload) =>
                      manualMetricsMutation.mutate({ postId, payload })
                    }
                  />
                  {postsData?.pagination ? (
                    <Pagination
                      {...postsData.pagination}
                      page={postsData.pagination.page}
                      pageSize={postsData.pagination.pageSize}
                      totalItems={postsData.pagination.totalItems}
                      totalPages={postsData.pagination.totalPages}
                      hasNextPage={postsData.pagination.hasNextPage}
                      hasPreviousPage={postsData.pagination.hasPreviousPage}
                      loading={showPostsLoading}
                      onPageChange={postsPagination.setPage}
                      onPageSizeChange={postsPagination.setPageSize}
                    />
                  ) : null}
                </>
              ) : null}
              {!showPostsLoading && !postsError && !visiblePosts.length ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-sm text-slate-300">
                  {postsSearch.trim()
                    ? "No posts found for this search."
                    : "No posts found."}
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
export function RawInviteLinksSection({
  queries,
  report,
}: {
  queries: Pick<
    AnalyticsQueries,
    | "data"
    | "openSections"
    | "setOpenSections"
    | "inviteLinksData"
    | "inviteLinksSearch"
    | "setInviteLinksSearch"
    | "inviteLinksPagination"
    | "showInviteLinksLoading"
    | "isInviteLinksFetching"
  >;
  report: Pick<AnalyticsReport, "topInviteLinks">;
}) {
  const {
    data,
    openSections,
    setOpenSections,
    inviteLinksData,
    inviteLinksSearch,
    setInviteLinksSearch,
    inviteLinksPagination,
    showInviteLinksLoading,
    isInviteLinksFetching,
  } = queries;
  const { topInviteLinks } = report;
  return (
    <>
      {openSections.inviteLinks ||
      toNumber(data?.summary?.inviteLinksCount) > 0 ? (
        <section className="mt-6">
          <SectionToggle
            title="Raw Invite Links"
            open={openSections.inviteLinks}
            onToggle={() =>
              setOpenSections((prev) => ({
                ...prev,
                inviteLinks: !prev.inviteLinks,
              }))
            }
          />
          {openSections.inviteLinks ? (
            <>
              <div className="mb-3 max-w-md">
                <FormField label="Search">
                  <Input
                    value={inviteLinksSearch}
                    onChange={(event) =>
                      setInviteLinksSearch(event.target.value)
                    }
                    placeholder="Invite link, URL, creator"
                  />
                </FormField>
                {isInviteLinksFetching ? (
                  <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-400">
                    <LoaderCircle size={14} className="animate-spin" />
                    Searching invite links...
                  </div>
                ) : null}
              </div>
              {showInviteLinksLoading ? (
                <TableLoadingState
                  text="Loading invite links"
                  columns={3}
                  rows={
                    inviteLinksData?.items.length ||
                    inviteLinksPagination.pageSize
                  }
                />
              ) : topInviteLinks.length ? (
                <InviteLinksTable links={topInviteLinks} />
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-sm text-slate-300">
                  {inviteLinksSearch.trim()
                    ? "No invite links found for this search."
                    : "No invite links found."}
                </div>
              )}
              {inviteLinksData?.pagination ? (
                <Pagination
                  {...inviteLinksData.pagination}
                  page={inviteLinksData.pagination.page}
                  pageSize={inviteLinksData.pagination.pageSize}
                  totalItems={inviteLinksData.pagination.totalItems}
                  totalPages={inviteLinksData.pagination.totalPages}
                  hasNextPage={inviteLinksData.pagination.hasNextPage}
                  hasPreviousPage={inviteLinksData.pagination.hasPreviousPage}
                  loading={showInviteLinksLoading}
                  onPageChange={inviteLinksPagination.setPage}
                  onPageSizeChange={inviteLinksPagination.setPageSize}
                />
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
function CampaignsTable({
  campaigns,
  currencySettings,
  rates,
}: {
  campaigns: any[];
  currencySettings: any;
  rates: any[] | undefined;
}) {
  return (
    <AdCampaignsTable
      campaigns={campaigns}
      moneySettings={currencySettings}
      rates={rates}
      showActions={false}
      showHypotheses
    />
  );
}
