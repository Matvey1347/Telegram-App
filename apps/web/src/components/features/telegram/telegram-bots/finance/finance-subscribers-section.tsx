"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Input, Select, Table } from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import {
  botBillingApi,
  type BotBillingSubscribersQuery,
} from "@/lib/features/finance/bot-billing-api";
import { botBillingKeys } from "@/lib/query-keys";
import {
  formatBillingDate,
  formatBillingMoney,
} from "./finance-billing-format";
export function FinanceSubscribersSection({ botId }: { botId: string }) {
  const [query, setQuery] = useState<BotBillingSubscribersQuery>({});
  const [history, setHistory] = useState<string[]>([]);
  const subscribers = useQuery({
    queryKey: botBillingKeys.subscribers(botId, query),
    queryFn: () => botBillingApi.subscribers(botId, query),
  });
  const setFilter = (changes: Partial<BotBillingSubscribersQuery>) => {
    setHistory([]);
    setQuery((value) => ({ ...value, ...changes, cursor: undefined }));
  };
  const next = () => {
    const nextCursor = subscribers.data?.nextCursor;
    if (!nextCursor) return;
    setHistory((value) => [...value, query.cursor ?? ""]);
    setQuery((value) => ({ ...value, cursor: nextCursor }));
  };
  const previous = () => {
    const cursor = history.at(-1);
    setHistory((value) => value.slice(0, -1));
    setQuery((value) => ({ ...value, cursor: cursor || undefined }));
  };
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <Input
            value={query.search ?? ""}
            onChange={(e) => setFilter({ search: e.target.value || undefined })}
            placeholder="Search user"
          />
          <Select
            value={query.status ?? ""}
            onChange={(e) =>
              setFilter({
                status: (e.target.value ||
                  undefined) as BotBillingSubscribersQuery["status"],
              })
            }
          >
            <option value="">All statuses</option>
            {["ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED", "INCOMPLETE"].map(
              (status) => (
                <option key={status}>{status}</option>
              ),
            )}
          </Select>
          <Select
            value={query.source ?? ""}
            onChange={(e) =>
              setFilter({
                source: (e.target.value ||
                  undefined) as BotBillingSubscribersQuery["source"],
              })
            }
          >
            <option value="">All sources</option>
            {["STRIPE", "TELEGRAM_STARS", "MANUAL", "GIFT"].map((source) => (
              <option key={source}>{source}</option>
            ))}
          </Select>
          <Input
            value={query.planId ?? ""}
            onChange={(e) => setFilter({ planId: e.target.value || undefined })}
            placeholder="Plan ID"
          />
        </div>
      </Card>
      <QueryContentState
        isLoading={subscribers.isLoading}
        isError={subscribers.isError}
        isEmpty={!subscribers.data?.items.length}
        loadingText="Loading subscribers"
        errorText="Could not load subscribers."
        emptyText="No subscribers match these filters"
        onRetry={() => void subscribers.refetch()}
      >
        {subscribers.data ? (
          <Card className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Plan</th>
                    <th>Price</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Current period</th>
                    <th>Cancel at period end</th>
                    <th>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.data.items.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-neutral-800 text-sm"
                    >
                      <td>
                        {row.user.username
                          ? `@${row.user.username}`
                          : row.user.firstName || row.user.telegramUserId}
                      </td>
                      <td>{row.plan?.name ?? "—"}</td>
                      <td>
                        {row.amountMinor == null
                          ? "—"
                          : `${formatBillingMoney(row.amountMinor, row.currency)}${row.interval ? ` / ${row.interval.toLowerCase()}` : ""}`}
                      </td>
                      <td>{row.provider ?? row.source}</td>
                      <td>{row.status}</td>
                      <td>
                        {formatBillingDate(row.currentPeriodStart)} –{" "}
                        {formatBillingDate(row.currentPeriodEnd)}
                      </td>
                      <td>{row.cancelAtPeriodEnd ? "Yes" : "No"}</td>
                      <td>{formatBillingDate(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        ) : null}
      </QueryContentState>
      {subscribers.data ? (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={!history.length || subscribers.isFetching}
            onClick={previous}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={!subscribers.data.nextCursor || subscribers.isFetching}
            onClick={next}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
