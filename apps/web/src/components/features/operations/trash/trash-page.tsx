"use client";
import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Pagination } from "@/components/ui/pagination";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  TableLoadingState,
} from "@/components/ui/primitives";
import { trashApi } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";

export function TrashPage() {
  const qc = useQueryClient();
  const { startOperation } = useAppToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const query = useQuery({
    queryKey: ["trash", page, pageSize],
    queryFn: () => trashApi.list({ page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const restore = useMutation({
    mutationFn: ({ kind, id }: { kind: string; id: string }) =>
      trashApi.restore(kind, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trash"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["transaction-categories"] });
    },
  });
  const listLoading = query.isLoading || query.isPlaceholderData;
  const restoreItem = async (item: {
    kind: string;
    id: string;
    name: string;
  }) => {
    const operation = startOperation({
      id: `trash-restore:${item.kind}:${item.id}`,
      title: "Restoring",
      message: `Restoring ${item.name}...`,
    });
    try {
      await restore.mutateAsync(item);
      operation.succeed({
        title: "Restored",
        message: `${item.name} was restored`,
      });
    } catch (error) {
      operation.fail({
        title: "Restore failed",
        message:
          error instanceof Error ? error.message : "Could not restore item",
      });
    }
  };
  return (
    <AppShell>
      <PageHeader
        title="Trash"
        subtitle="Deleted Finance data can be restored for 90 days"
      />
      {listLoading ? (
        <TableLoadingState
          text="Loading trash"
          columns={5}
          rows={query.data?.items.length || pageSize}
        />
      ) : query.error ? (
        <ErrorState text="Failed to load trash" />
      ) : !query.data?.items.length ? (
        <EmptyState text="Trash is empty" />
      ) : (
        <Card className="!p-0">
          <div className="table-scroll">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-neutral-800 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Remaining</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((item) => (
                  <tr
                    key={`${item.kind}:${item.id}`}
                    className="border-b border-neutral-800 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-white">
                      {item.name}
                    </td>
                    <td className="px-4 py-3 text-neutral-400">
                      {item.product}
                    </td>
                    <td className="px-4 py-3 text-neutral-400">
                      {item.kind.replaceAll("_", " ")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          item.daysRemaining <= 7
                            ? "text-rose-300"
                            : "text-amber-300"
                        }
                      >
                        {item.daysRemaining} days
                      </span>
                      <div className="text-xs text-neutral-600">
                        until {new Date(item.expiresAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="secondary"
                        disabled={restore.isPending}
                        onClick={() => void restoreItem(item)}
                      >
                        <RotateCcw size={15} /> Restore
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {query.data ? (
        <Pagination
          {...query.data.pagination}
          loading={listLoading}
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPage(1);
            setPageSize(value);
          }}
        />
      ) : null}
    </AppShell>
  );
}
