"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, CustomSelect } from "@/components/ui/primitives";

type PaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  loading?: boolean;
  disabled?: boolean;
};

function buildPageItems(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (page <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-left", totalPages];
  }

  if (page >= totalPages - 3) {
    return [
      1,
      "ellipsis-right",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [1, "ellipsis-left", page - 1, page, page + 1, "ellipsis-right", totalPages];
}

export function Pagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
  onPageSizeChange,
  loading = false,
  disabled = false,
}: PaginationProps) {
  const isDisabled = disabled || loading || totalItems === 0;
  const shouldRender = totalItems > pageSize && totalPages > 1;

  if (!shouldRender) {
    return null;
  }

  const pageItems = buildPageItems(page, totalPages);

  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-sm text-neutral-300 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/70">
          <Button type="button" variant="secondary" aria-label="Previous page" disabled={isDisabled || !hasPreviousPage} onClick={() => onPageChange(page - 1)} className="rounded-none border-0 bg-transparent px-3 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"><ChevronLeft size={16} /></Button>
          <span aria-live="polite" className="flex min-w-24 items-center justify-center border-l border-neutral-800 px-3 py-2 font-medium sm:hidden">Page {page} of {totalPages}</span>
          <div className="hidden sm:flex">
            {pageItems.map((item) => typeof item === "number" ? <button key={item} type="button" aria-label={`Go to page ${item}`} aria-current={item === page ? "page" : undefined} disabled={isDisabled} onClick={() => onPageChange(item)} className={`min-w-10 border-l border-neutral-800 px-3 py-2 text-sm font-medium transition ${item === page ? "bg-blue-600 text-white" : "text-neutral-300 hover:bg-neutral-800"} disabled:opacity-50`}>{item}</button> : <span key={item} aria-hidden="true" className="min-w-10 border-l border-neutral-800 px-3 py-2 text-center text-neutral-500">…</span>)}
          </div>
          <Button type="button" variant="secondary" aria-label="Next page" disabled={isDisabled || !hasNextPage} onClick={() => onPageChange(page + 1)} className="rounded-none border-0 border-l border-neutral-800 bg-transparent px-3 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"><ChevronRight size={16} /></Button>
        </div>
        <span className="text-neutral-400" aria-live="polite">
          Showing{" "}
          <span className="text-neutral-200">
            {(page - 1) * pageSize + 1}
          </span>
          {" "}to{" "}
          <span className="text-neutral-200">
            {Math.min(page * pageSize, totalItems)}
          </span>
          {" "}of{" "}
          <span className="text-neutral-200">{totalItems.toLocaleString()}</span>
          {" "}results
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-neutral-800 pt-3 lg:border-0 lg:pt-0">
        <span className="text-neutral-500">Rows per page</span>
        <CustomSelect
          value={String(pageSize)}
          onChange={(value) => onPageSizeChange(Number(value))}
          disabled={disabled || loading}
          searchable={false}
          options={[10, 25, 50, 100].map((size) => ({
            value: String(size),
            label: String(size),
          }))}
        />
      </div>
    </nav>
  );
}
