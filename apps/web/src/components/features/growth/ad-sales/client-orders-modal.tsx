"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SalesTab } from "./ad-sales-sales-tab";
import {
  EmptyState,
  ErrorState,
  Modal,
} from "@/components/ui/primitives";
import {
  telegramAdSalesApi,
  type TelegramAdCrmAdvertiserListItem,
} from "@/lib/api";
import { telegramAdSalesKeys } from "@/lib/features/growth/telegram-ad-sales-query";

export function ClientOrdersModal({
  client,
  onClose,
}: {
  client: TelegramAdCrmAdvertiserListItem | null;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const params = { page, pageSize, advertiserId: client?.id ?? "" };
  const ordersQuery = useQuery({
    queryKey: telegramAdSalesKeys.sales(params),
    queryFn: () => telegramAdSalesApi.listSalesPage(params),
    enabled: Boolean(client),
    staleTime: 60_000,
  });

  if (!client) return null;
  const title = isUnspecifiedClient(client)
    ? "No client · Orders"
    : `${client.displayName} · Orders`;
  const orders = ordersQuery.data?.items ?? [];

  return (
    <Modal
      open
      size="xl"
      title={title}
      onClose={() => {
        setPage(1);
        onClose();
      }}
    >
      {ordersQuery.error ? (
        <ErrorState text="Could not load client orders." />
      ) : !ordersQuery.isLoading && orders.length === 0 ? (
        <EmptyState text="This client has no orders." />
      ) : (
        <SalesTab
          embedded
          sales={orders}
          channels={(client.purchasedChannels ?? []).map((channel) => ({
            ...channel,
          })) as never}
          loading={ordersQuery.isLoading}
          error={ordersQuery.error}
          page={page}
          pageSize={pageSize}
          pagination={ordersQuery.data?.pagination}
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setPage(1);
          }}
          search=""
          onSearchChange={() => undefined}
          settings={undefined}
          rates={undefined}
          onOpenSale={() => undefined}
          onDeleteSale={async () => undefined}
        />
      )}
    </Modal>
  );
}

function isUnspecifiedClient(client: TelegramAdCrmAdvertiserListItem) {
  return (
    client.displayName.trim().toLowerCase() === "advertiser" &&
    !client.companyName &&
    !client.telegramUsername &&
    !client.primaryContact
  );
}
