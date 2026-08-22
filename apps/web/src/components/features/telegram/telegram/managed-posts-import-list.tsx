import type { ReactNode } from "react";
import {
  importImageSearchToArray,
  urlsTextToArray,
  type EditableImportRow,
  type ImportRowTab,
} from "./managed-posts-import-model";

export function ManagedPostsImportList({
  rows,
  visibleRowIndices,
  selectedRowIndex,
  activeTab,
  tabCounts,
  disabled,
  onSelectRow,
  onSelectTab,
}: {
  rows: EditableImportRow[];
  visibleRowIndices: number[];
  selectedRowIndex: number;
  activeTab: ImportRowTab;
  tabCounts: Record<ImportRowTab, number>;
  disabled: boolean;
  onSelectRow: (index: number) => void;
  onSelectTab: (tab: ImportRowTab) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg border border-neutral-800 bg-neutral-900/70 p-1 text-xs">
        {(["new", "approved", "imported"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onSelectTab(tab)}
            className={`rounded-md px-2 py-1.5 capitalize transition ${
              activeTab === tab
                ? "bg-blue-600 text-white"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
            }`}
          >
            {tab} ({tabCounts[tab]})
          </button>
        ))}
      </div>
      <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
        {visibleRowIndices.map((index) => {
          const row = rows[index];
          return (
            <button
              key={`${index}-${row.title}`}
              type="button"
              disabled={disabled}
              onClick={() => onSelectRow(index)}
              className={`flex w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                index === selectedRowIndex
                  ? "border-blue-500 bg-blue-950/40 text-white"
                  : "border-neutral-800 bg-neutral-900/70 text-neutral-300 hover:border-neutral-600"
              }`}
            >
              <span className="w-5 shrink-0 text-center text-xs tabular-nums text-neutral-500">
                {index + 1}
              </span>
              {row.icon ? <span className="shrink-0">{row.icon}</span> : null}
              <span className="min-w-0 flex-1 truncate font-medium">
                {row.title || "Untitled post"}
              </span>
              {row.approved ? <StatusBadge tone="approved">✓ Approved</StatusBadge> : null}
              {row.imported ? <StatusBadge tone="imported">✓ Imported</StatusBadge> : null}
              {urlsTextToArray(row.urlsText).length ? (
                <StatusBadge tone="image">img</StatusBadge>
              ) : null}
              {importImageSearchToArray(row.imageSearchText).length ? (
                <StatusBadge tone="search">search</StatusBadge>
              ) : null}
            </button>
          );
        })}
        {!visibleRowIndices.length ? (
          <p className="rounded-lg border border-dashed border-neutral-800 p-4 text-center text-xs text-neutral-500">
            No posts in this tab.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "approved" | "imported" | "image" | "search";
}) {
  const colors = {
    approved: "bg-amber-950/70 text-amber-200",
    imported: "bg-emerald-950/70 text-emerald-200",
    image: "bg-neutral-800 text-neutral-300",
    search: "bg-blue-950/60 text-blue-200",
  }[tone];
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${colors}`}>
      {children}
    </span>
  );
}
