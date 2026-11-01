"use client";
import { useLeadText } from "./lead-copy";
import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Button, Select } from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  leadKeys,
  leadQueryPolicy,
} from "@/lib/features/growth/lead-discovery-query";
import { LeadQueryState } from "./lead-query-state";
export function LeadChannelPicker({
  workspace,
  onChoose,
  onAccount,
  allowOwn = false,
}: {
  workspace: string;
  onAccount?: (id: string) => void;
  allowOwn?: boolean;
  onChoose: (reference: string, title: string, account: string) => void;
}) {
  const t = useLeadText();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState("");
  const accounts = useQuery({
    queryKey: leadKeys.accounts(workspace),
    queryFn: leadDiscoveryApi.accounts,
    enabled: open,
    ...leadQueryPolicy,
  });
  const channels = useInfiniteQuery({
    queryKey: leadKeys.channels(workspace, account),
    queryFn: ({ pageParam, signal }) =>
      leadDiscoveryApi.channels(account, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) =>
      p.hasMore ? (p.nextCursor ?? undefined) : undefined,
    enabled: open && !!account,
    ...leadQueryPolicy,
  });
  return (
    <div className="space-y-3">
      <Button
        className="max-w-full !whitespace-normal"
        variant="secondary"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {t("Choose from an existing live account")}
      </Button>
      {open ? (
        <>
          <p className="text-xs text-neutral-400">
            {t(
              "This lists permitted channels using an existing connection. It never joins channels. Own channels require a separate explicit manual override.",
            )}
          </p>
          <Select
            aria-label="Live Telegram account"
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              onAccount?.(e.target.value);
            }}
          >
            <option value="">{t("Select a live account")}</option>
            {accounts.data?.map((v) => (
              <option key={v.id} value={v.id} disabled={!v.live}>
                {v.label}
                {v.live ? "" : " · not live"}
              </option>
            ))}
          </Select>
          {accounts.isError ? (
            <p role="alert">{t("Available accounts could not be loaded.")}</p>
          ) : null}
          {accounts.data && !accounts.data.some((v) => v.live) ? (
            <p className="text-sm text-amber-200">
              {t(
                "No existing live account is available. Start the existing account integration before requesting channels.",
              )}
            </p>
          ) : null}
          {account ? (
            <>
              <LeadQueryState
                loading={channels.isLoading}
                error={channels.isError}
                empty={
                  channels.isSuccess && !channels.data.pages[0].items.length
                }
                onRetry={() => void channels.refetch()}
              />
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {channels.data?.pages
                  .flatMap((p) => p.items)
                  .map((v) => (
                    <div
                      key={v.channelId}
                      className="flex items-center justify-between gap-2 border-t border-neutral-800 pt-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="break-words">{v.title}</p>
                        <p className="text-xs text-neutral-400">
                          {v.isOwn
                            ? "Own channel — manual override required"
                            : v.eligibleForSelection
                              ? "Available for review"
                              : "Ineligible or access restricted"}
                        </p>
                      </div>
                      <Button
                        className="max-w-full !whitespace-normal"
                        variant="secondary"
                        disabled={
                          (!v.eligibleForSelection && !v.isOwn) ||
                          (v.isOwn && !allowOwn)
                        }
                        onClick={() =>
                          onChoose(
                            v.username ? "@" + v.username : v.channelId,
                            v.title,
                            account,
                          )
                        }
                      >
                        {t("Choose source")}
                      </Button>
                    </div>
                  ))}
              </div>
              {channels.hasNextPage ? (
                <Button
                  className="max-w-full !whitespace-normal"
                  variant="secondary"
                  disabled={channels.isFetchingNextPage}
                  onClick={() => void channels.fetchNextPage()}
                >
                  {t("Load more channels")}
                </Button>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
