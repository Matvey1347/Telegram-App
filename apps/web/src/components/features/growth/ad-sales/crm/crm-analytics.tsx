"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
} from "@/components/ui/primitives";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <Card className="border-neutral-800 bg-[#171717] p-4">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{hint}</p>
    </Card>
  );
}

export function CrmAnalytics() {
  const query = useQuery({
    queryKey: telegramCrmKeys.analytics(),
    queryFn: ({ signal }) => telegramCrmApi.getAnalytics(signal),
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });
  if (query.isLoading)
    return (
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
    );
  if (query.error) return <ErrorState text="Could not load CRM analytics." />;
  const data = query.data;
  if (!data) return <EmptyState text="No CRM analytics are available yet." />;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Unique clients with tags"
          value={data.clients}
          hint="Tagged CRM client cards"
        />
        <Metric
          label="Clients without tags"
          value={data.untaggedClients}
          hint="Kept out of unique-client analytics"
        />
        <Metric
          label="Buyer conversion"
          value={`${data.conversionRate}%`}
          hint="Buyers of all unique clients"
        />
        <Metric
          label="Buyers"
          value={data.buyers}
          hint="Clients with a first purchase"
        />
        <Metric
          label="Average paid per order"
          value={`${data.averagePaidOrderValue} ${data.currency}`}
          hint="Recorded payments divided by paid orders"
        />
      </div>
      <Card className="border-neutral-800 bg-[#171717] p-5">
        <div className="mb-4">
          <h2 className="font-semibold text-white">Client growth</h2>
          <p className="text-sm text-neutral-500">
            Cumulative unique clients and buyers over the last 12 months.
          </p>
        </div>
        {data.points.length ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.points}>
                <CartesianGrid stroke="#262626" />
                <XAxis dataKey="date" stroke="#737373" />
                <YAxis allowDecimals={false} stroke="#737373" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#171717",
                    border: "1px solid #404040",
                    borderRadius: 8,
                    color: "#fff",
                  }}
                  labelStyle={{ color: "#d4d4d4" }}
                  itemStyle={{ color: "#fff" }}
                />
                <Area
                  type="monotone"
                  dataKey="clients"
                  name="Clients"
                  stroke="#60a5fa"
                  fill="#2563eb33"
                />
                <Area
                  type="monotone"
                  dataKey="untaggedClients"
                  name="Without tags"
                  stroke="#a78bfa"
                  fill="#8b5cf622"
                />
                <Area
                  type="monotone"
                  dataKey="buyers"
                  name="Buyers"
                  stroke="#34d399"
                  fill="#10b98122"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState text="Client growth will appear after the first client is added." />
        )}
      </Card>
    </div>
  );
}
