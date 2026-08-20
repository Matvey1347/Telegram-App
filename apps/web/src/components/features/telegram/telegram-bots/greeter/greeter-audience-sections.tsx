"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  GreeterAnalyticsQuery,
  GreeterChannelView,
  GreeterUsersQuery,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  CustomSelect,
  DateRangeInput,
  Input,
  Table,
} from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { QueryContentState } from "@/components/ui/query-content-state";
import { greeterApi } from "@/lib/api";
import { greeterKeys } from "@/lib/query-keys";

export function GreeterUsersSection({
  botId,
  channels,
}: {
  botId: string;
  channels: GreeterChannelView[];
}) {
  const [query, setQuery] = useState<GreeterUsersQuery>({
    page: 1,
    pageSize: 25,
  });
  const users = useQuery({
    queryKey: greeterKeys.users(botId, query),
    queryFn: () => greeterApi.users(botId, query),
  });
  const setFilter = (next: Partial<GreeterUsersQuery>) =>
    setQuery((value) => ({ ...value, ...next, page: 1 }));
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <Input
            value={query.search || ""}
            onChange={(e) => setFilter({ search: e.target.value })}
            placeholder="Search name, username, or ID"
          />
          <CustomSelect
            value={query.channelId || ""}
            onChange={(channelId) =>
              setFilter({ channelId: channelId || undefined })
            }
            options={[
              { value: "", label: "All channels" },
              ...channels.map((item) => ({
                value: item.channel.id,
                label: item.channel.title,
              })),
            ]}
            searchable={false}
          />
          <CustomSelect
            value={query.state || ""}
            onChange={(state) =>
              setFilter({
                state: (state || undefined) as GreeterUsersQuery["state"],
              })
            }
            options={[
              { value: "", label: "All user states" },
              { value: "ALIVE", label: "Alive" },
              { value: "BLOCKED", label: "Blocked" },
              { value: "DID_NOT_INTERACT", label: "Did not interact" },
            ]}
            searchable={false}
          />
          <CustomSelect
            value={query.captchaStatus || ""}
            onChange={(captchaStatus) =>
              setFilter({
                captchaStatus: (captchaStatus ||
                  undefined) as GreeterUsersQuery["captchaStatus"],
              })
            }
            options={[
              { value: "", label: "All captcha states" },
              ...[
                "PENDING",
                "PASSED",
                "FAILED",
                "APPROVED",
                "DECLINED",
                "EXPIRED",
              ].map((value) => ({ value, label: value.replaceAll("_", " ") })),
            ]}
            searchable={false}
          />
        </div>
      </Card>
      <QueryContentState
        isLoading={users.isLoading}
        isError={users.isError}
        isEmpty={!users.data?.items.length}
        loadingText="Loading users"
        errorText="Failed to load Greeter users."
        emptyText="No users match these filters"
        onRetry={() => void users.refetch()}
      >
        <Card className="p-0 sm:p-0">
          <Table>
            <thead>
              <tr className="border-b border-neutral-800 text-xs uppercase text-neutral-500">
                <Th>User</Th>
                <Th>Channel</Th>
                <Th>Captcha</Th>
                <Th>State</Th>
                <Th>First seen</Th>
                <Th>Join requested</Th>
                <Th>Approved</Th>
                <Th>Last interaction</Th>
              </tr>
            </thead>
            <tbody>
              {users.data?.items.map((user) => (
                <tr key={user.id} className="border-b border-neutral-800/70">
                  <Td>
                    <span className="font-medium text-white">
                      {user.displayName}
                    </span>
                    <br />
                    <span className="text-neutral-500">
                      {user.username
                        ? `@${user.username}`
                        : user.telegramUserId}
                    </span>
                  </Td>
                  <Td>{user.channel.title}</Td>
                  <Td>{user.captchaStatus.replaceAll("_", " ")}</Td>
                  <Td>{user.state.replaceAll("_", " ")}</Td>
                  <Td>{new Date(user.firstSeenAt).toLocaleString()}</Td>
                  <Td>{new Date(user.joinRequestedAt).toLocaleString()}</Td>
                  <Td>
                    {user.approvedAt
                      ? new Date(user.approvedAt).toLocaleString()
                      : "—"}
                  </Td>
                  <Td>{new Date(user.lastInteractionAt).toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </QueryContentState>
      {users.data ? (
        <Pagination
          {...users.data.pagination}
          onPageChange={(page) => setQuery((value) => ({ ...value, page }))}
          onPageSizeChange={(pageSize) =>
            setQuery((value) => ({ ...value, page: 1, pageSize }))
          }
          loading={users.isFetching}
        />
      ) : null}
    </div>
  );
}

export function GreeterAnalyticsSection({
  botId,
  channels,
}: {
  botId: string;
  channels: GreeterChannelView[];
}) {
  const [query, setQuery] = useState<GreeterAnalyticsQuery>({});
  const analytics = useQuery({
    queryKey: greeterKeys.analytics(botId, query),
    queryFn: () => greeterApi.analytics(botId, query),
  });
  const metrics = analytics.data?.metrics;
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              setQuery((value) => ({
                ...value,
                from: undefined,
                to: undefined,
              }))
            }
          >
            Total
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              setQuery((value) => ({ ...value, from: today, to: today }));
            }}
          >
            Today
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <DateRangeInput
            from={query.from || ""}
            to={query.to || ""}
            onChange={({ from, to }) =>
              setQuery((value) => ({
                ...value,
                from: from || undefined,
                to: to || undefined,
              }))
            }
          />
          <CustomSelect
            value={query.channelId || ""}
            onChange={(channelId) =>
              setQuery((value) => ({
                ...value,
                channelId: channelId || undefined,
              }))
            }
            options={[
              { value: "", label: "All channels" },
              ...channels.map((item) => ({
                value: item.channel.id,
                label: item.channel.title,
              })),
            ]}
            searchable={false}
          />
        </div>
      </Card>
      <QueryContentState
        isLoading={analytics.isLoading}
        isError={analytics.isError}
        isEmpty={!analytics.data}
        loadingText="Loading analytics"
        errorText="Failed to load Greeter analytics."
        emptyText="No analytics available"
        onRetry={() => void analytics.refetch()}
      >
        {metrics ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Growth", metrics.growth],
                ["Alive", metrics.alive],
                ["Blocked", metrics.blocked],
                ["Did not interact", metrics.didNotInteract],
                ["Join requests", metrics.joinRequests],
                ["Captcha started", metrics.captchaStarted],
                ["Captcha passed", metrics.captchaPassed],
                ["Captcha failed", metrics.captchaFailed],
                ["Pass rate", `${(metrics.captchaPassRate * 100).toFixed(1)}%`],
                ["Approved", metrics.approved],
                [
                  "Interaction",
                  `${(metrics.interactionRate * 100).toFixed(1)}%`,
                ],
              ].map(([label, value]) => (
                <Card key={label}>
                  <p className="text-xs uppercase text-neutral-500">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {value}
                  </p>
                </Card>
              ))}
            </div>
            <Card className="mt-4">
              <h3 className="mb-3 font-semibold text-white">
                Acquisition and CAPTCHA conversion
              </h3>
              <div className="h-72 min-w-0" aria-label="Greeter trends chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.data?.trends || []}>
                    <CartesianGrid stroke="#262626" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="#a3a3a3" />
                    <YAxis allowDecimals={false} stroke="#a3a3a3" />
                    <Tooltip />
                    <Legend />
                    <Line dataKey="acquired" stroke="#3b82f6" />
                    <Line dataKey="captchaStarted" stroke="#f59e0b" />
                    <Line dataKey="captchaPassed" stroke="#10b981" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="mt-4 p-0 sm:p-0">
              <Table>
                <thead>
                  <tr className="border-b border-neutral-800 text-xs uppercase text-neutral-500">
                    <Th>Date</Th>
                    <Th>Acquired</Th>
                    <Th>Captcha started</Th>
                    <Th>Passed</Th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.data?.trends.map((point) => (
                    <tr
                      key={point.date}
                      className="border-b border-neutral-800/70"
                    >
                      <Td>{point.date}</Td>
                      <Td>{point.acquired}</Td>
                      <Td>{point.captchaStarted}</Td>
                      <Td>{point.captchaPassed}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </>
        ) : null}
      </QueryContentState>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 text-neutral-300">{children}</td>;
}
