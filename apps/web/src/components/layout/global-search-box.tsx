"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import type { GlobalSearchResult } from "@/lib/api";

function SearchResultIcon({ result }: { result: GlobalSearchResult }) {
  if (result.iconUrl) {
    return (
      // Search results may use Telegram-hosted image URLs outside Next's static allowlist.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={result.iconUrl}
        alt=""
        className="h-7 w-7 shrink-0 rounded-md object-cover"
      />
    );
  }
  if (result.iconEmoji) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center text-base">
        {result.iconEmoji}
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 text-xs font-semibold text-neutral-200">
      {(result.title.trim()[0] || result.label.trim()[0] || "?").toUpperCase()}
    </span>
  );
}

export function GlobalSearchBox({
  query,
  onQueryChange,
  focused,
  onFocusedChange,
  results,
  isFetching,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  focused: boolean;
  onFocusedChange: (value: boolean) => void;
  results: GlobalSearchResult[];
  isFetching: boolean;
}) {
  const showResults = focused && query.trim().length >= 2;
  return (
    <div className="relative mb-3">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
        />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => onFocusedChange(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onFocusedChange(false);
          }}
          placeholder="Search everything"
          className="h-10 w-full rounded-xl border border-neutral-800 bg-neutral-900/45 pl-9 pr-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-blue-600 focus:bg-neutral-900/70 focus:ring-1 focus:ring-blue-600"
        />
      </div>
      {showResults ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-auto rounded-lg border border-neutral-800 bg-neutral-950 p-1 shadow-2xl"
          onMouseDown={(event) => event.preventDefault()}
        >
          {isFetching ? (
            <p className="px-3 py-2 text-sm text-neutral-400">Searching...</p>
          ) : null}
          {!isFetching && results.length ? (
            <div className="space-y-1">
              {results.map((result) => (
                <Link
                  key={`${result.type}-${result.id}`}
                  href={result.href}
                  onClick={() => {
                    onFocusedChange(false);
                    onQueryChange("");
                  }}
                  className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                >
                  <SearchResultIcon result={result} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-white">
                      {result.title}
                    </span>
                    <span className="block truncate text-xs text-neutral-500">
                      {result.label}
                      {result.subtitle ? ` · ${result.subtitle}` : ""}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
          {!isFetching && !results.length ? (
            <p className="px-3 py-2 text-sm text-neutral-400">No results</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
