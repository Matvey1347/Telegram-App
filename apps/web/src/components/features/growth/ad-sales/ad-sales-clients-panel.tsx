"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowUpDown, Check, SlidersHorizontal, X } from "lucide-react";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { Pagination } from "@/components/ui/pagination";
import {
  Card,
  ErrorState,
  FormField,
  Input,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { AdSalesClientsTable } from "@/components/features/growth/ad-sales/ad-sales-clients-table";
import { ClientOrdersModal } from "@/components/features/growth/ad-sales/client-orders-modal";
import type { TelegramAdCrmAdvertiserListItem } from "@/lib/api";
import { telegramAdSalesApi } from "@/lib/api";
import { telegramAdSalesKeys } from "@/lib/features/growth/telegram-ad-sales-query";

const panelClass = "rounded-[22px] border border-neutral-800 bg-[#171717]";
const clientsCacheOptions = {
  staleTime: 2 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: false,
} as const;

const statusOptions = [
  { value: "", label: "All statuses" },
  { value: "LEAD", label: "Lead" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "LOST", label: "Lost" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "ARCHIVED", label: "Archived" },
];

const lifecycleOptions = [
  { value: "", label: "All lifecycle stages" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "CUSTOMER", label: "Customer" },
  { value: "REPEAT_CUSTOMER", label: "Repeat customer" },
  { value: "REACTIVATION", label: "Reactivation" },
  { value: "CHURNED", label: "Churned" },
];

type ArchivedFilter = "active" | "archived" | "all";
type ClientSort = "PRIORITY" | "REVENUE" | "RECENT_PURCHASE" | "NAME" | "SALES";
type SortDirection = "ASC" | "DESC";

const clientSortOptions: Array<{
  label: string;
  sortBy: ClientSort;
  sortDirection: SortDirection;
}> = [
  { label: "Priority", sortBy: "PRIORITY", sortDirection: "DESC" },
  {
    label: "Recent purchase",
    sortBy: "RECENT_PURCHASE",
    sortDirection: "DESC",
  },
  { label: "Revenue: high to low", sortBy: "REVENUE", sortDirection: "DESC" },
  { label: "Revenue: low to high", sortBy: "REVENUE", sortDirection: "ASC" },
  { label: "Orders: most first", sortBy: "SALES", sortDirection: "DESC" },
  { label: "Name: A–Z", sortBy: "NAME", sortDirection: "ASC" },
  { label: "Name: Z–A", sortBy: "NAME", sortDirection: "DESC" },
];

export function AdSalesClientsPanel() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [lifecycleStage, setLifecycleStage] = useState("");
  const [ownerMemberId, setOwnerMemberId] = useState("");
  const [archived, setArchived] = useState<ArchivedFilter>("active");
  const [sortBy, setSortBy] = useState<ClientSort>("PRIORITY");
  const [sortDirection, setSortDirection] = useState<SortDirection>("DESC");
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [ordersClient, setOrdersClient] =
    useState<TelegramAdCrmAdvertiserListItem | null>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      300,
    );
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!sortOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (!sortMenuRef.current?.contains(event.target as Node))
        setSortOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSortOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [sortOpen]);

  const queryParams = useMemo(
    () => ({
      page,
      pageSize,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(status ? { status } : {}),
      ...(lifecycleStage ? { lifecycleStage } : {}),
      ...(ownerMemberId ? { ownerMemberId } : {}),
      ...(archived === "all" ? {} : { archived: archived === "archived" }),
      sortBy,
      sortDirection,
    }),
    [
      archived,
      debouncedSearch,
      lifecycleStage,
      ownerMemberId,
      page,
      pageSize,
      sortBy,
      sortDirection,
      status,
    ],
  );

  const clientsQuery = useQuery({
    queryKey: telegramAdSalesKeys.crmAdvertisers(queryParams),
    queryFn: () => telegramAdSalesApi.listCrmAdvertisers(queryParams),
    ...clientsCacheOptions,
  });
  const updateClient = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Record<string, unknown>;
    }) => telegramAdSalesApi.updateAdvertiser(id, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: telegramAdSalesKeys.crmAdvertisersRoot(),
      }),
  });

  const clients = clientsQuery.data?.items ?? [];
  const nowMs = clientsQuery.dataUpdatedAt;
  const overdueTaskCount = clients.filter((client) =>
    client.nextOpenTask?.dueAt
      ? new Date(client.nextOpenTask.dueAt).getTime() < nowMs
      : false,
  ).length;

  const resetPage = (callback: () => void) => {
    setPage(1);
    callback();
  };
  const activeFilterCount =
    [status, lifecycleStage, ownerMemberId].filter(Boolean).length +
    Number(archived !== "active");
  const clearFilters = () => {
    setPage(1);
    setStatus("");
    setLifecycleStage("");
    setOwnerMemberId("");
    setArchived("active");
  };

  return (
    <div className="space-y-5">
      <Card className={`${panelClass} p-3`}>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <FormField label="Search">
              <Input
                value={search}
                onChange={(event) =>
                  resetPage(() => setSearch(event.target.value))
                }
                placeholder="Name, company, Telegram, contact"
              />
            </FormField>
          </div>
          <div ref={sortMenuRef} className="relative self-end">
            <button
              type="button"
              className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg text-neutral-300 transition hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Sort clients"
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              title="Sort clients"
              onClick={() => setSortOpen((current) => !current)}
            >
              <ArrowUpDown size={20} />
            </button>
            {sortOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border border-neutral-700 bg-neutral-950 p-1 shadow-2xl"
              >
                {clientSortOptions.map((option) => {
                  const selected =
                    option.sortBy === sortBy &&
                    option.sortDirection === sortDirection;
                  return (
                    <button
                      key={`${option.sortBy}-${option.sortDirection}`}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => {
                        setPage(1);
                        setSortBy(option.sortBy);
                        setSortDirection(option.sortDirection);
                        setSortOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 hover:text-white"
                    >
                      {option.label}
                      {selected ? (
                        <Check size={15} className="text-blue-400" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="relative inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg text-neutral-300 transition hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Filters"
            aria-expanded={filtersOpen}
            title="Filters"
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <SlidersHorizontal size={20} />
            {activeFilterCount ? (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
          {activeFilterCount ? (
            <button
              type="button"
              aria-label="Clear filters"
              title="Clear filters"
              className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={clearFilters}
            >
              <X size={20} />
            </button>
          ) : null}
        </div>
        {filtersOpen ? (
          <div className="mt-3 grid gap-3 border-t border-neutral-800 pt-3 sm:grid-cols-2 xl:grid-cols-4">
            <FormField label="Status">
              <Select
                value={status}
                onChange={(event) =>
                  resetPage(() => setStatus(event.target.value))
                }
              >
                {statusOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Lifecycle">
              <Select
                value={lifecycleStage}
                onChange={(event) =>
                  resetPage(() => setLifecycleStage(event.target.value))
                }
              >
                {lifecycleOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Owner">
              <MemberSelect
                value={ownerMemberId}
                onChange={(value) => resetPage(() => setOwnerMemberId(value))}
                includeAll
              />
            </FormField>
            <FormField label="Archive">
              <Select
                value={archived}
                onChange={(event) =>
                  resetPage(() =>
                    setArchived(event.target.value as ArchivedFilter),
                  )
                }
              >
                <option value="active">Active only</option>
                <option value="archived">Archived only</option>
                <option value="all">All clients</option>
              </Select>
            </FormField>
          </div>
        ) : null}
      </Card>

      {clientsQuery.isLoading ? (
        <ClientsCardSkeleton />
      ) : null}
      {clientsQuery.error ? (
        <ErrorState text="Could not load ad-sales clients." />
      ) : null}
      {!clientsQuery.isLoading && !clientsQuery.error ? (
        <AdSalesClientsTable
          clients={clients}
          overdueTaskCount={overdueTaskCount}
          onUpdateClient={(id, payload) =>
            updateClient.mutateAsync({ id, payload })
          }
          onOpenOrders={setOrdersClient}
        />
      ) : null}

      <ClientOrdersModal
        client={ordersClient}
        onClose={() => setOrdersClient(null)}
      />

      {clientsQuery.data?.pagination ? (
        <Pagination
          page={clientsQuery.data.pagination.page}
          pageSize={clientsQuery.data.pagination.pageSize}
          totalItems={clientsQuery.data.pagination.totalItems}
          totalPages={clientsQuery.data.pagination.totalPages}
          hasNextPage={clientsQuery.data.pagination.hasNextPage}
          hasPreviousPage={clientsQuery.data.pagination.hasPreviousPage}
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setPage(1);
          }}
        />
      ) : null}
    </div>
  );
}

function ClientsCardSkeleton() {
  return (
    <div aria-label="Loading clients">
      <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="mb-4 break-inside-avoid rounded-lg border border-neutral-800 bg-neutral-950 p-3"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-3 border-t border-neutral-900 pt-3">
              {Array.from({ length: 4 }, (_, metric) => (
                <div key={metric} className="space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-5 w-4/5" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-4 h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
