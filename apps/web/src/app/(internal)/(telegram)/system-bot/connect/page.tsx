"use client";

import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import {
  Button,
  Card,
  LoadingState,
  PageHeader,
} from "@/components/ui/primitives";
import { telegramSystemBotApi } from "@/lib/api";
import { telegramSystemBotKeys } from "@/lib/query-keys";

export default function SystemBotConnectPage() {
  const token = useSearchParams().get("token") ?? "";
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: telegramSystemBotKeys.linkPreview(token),
    queryFn: () => telegramSystemBotApi.previewLink(token),
    enabled: token.length > 0,
    retry: false,
  });
  const connect = useMutation({
    mutationFn: () => telegramSystemBotApi.connect(token),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: telegramSystemBotKeys.connection(),
      }),
  });

  return (
    <AppShell>
      <PageHeader
        title="Connect Telegram System"
        subtitle="Confirm this account before enabling Telegram System Bot access."
      />
      <Card className="max-w-xl">
        {preview.isLoading ? <LoadingState /> : null}
        {preview.isError ? (
          <p className="text-sm text-rose-300">
            This connection link is invalid, expired, or already used.
          </p>
        ) : null}
        {preview.data ? (
          <div className="space-y-4">
            <div>
              <p className="font-medium text-white">
                {preview.data.telegramFirstName ?? "Telegram account"}
              </p>
              <p className="text-sm text-neutral-400">
                {preview.data.telegramUsername
                  ? `@${preview.data.telegramUsername}`
                  : "Telegram identity ready to connect"}
              </p>
            </div>
            <Button
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
            >
              {connect.isPending ? "Connecting..." : "Confirm connection"}
            </Button>
            {connect.isError ? (
              <p className="text-sm text-rose-300">
                Could not connect this Telegram account.
              </p>
            ) : null}
            {connect.isSuccess ? (
              <p className="text-sm text-emerald-300">
                Telegram System Bot is connected.
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>
    </AppShell>
  );
}
