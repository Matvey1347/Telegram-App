"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { Input } from "@/components/ui/primitives";

export type CampaignSelectOption = {
  value: string;
  label: string;
  labelContent?: React.ReactNode;
  iconUrl?: string;
  iconEmoji?: string;
  iconFallback?: string;
  icon?: React.ReactNode;
  description?: string;
  searchText?: string;
  badgeClassName?: string;
};

function SelectOptionVisual({ option }: { option: CampaignSelectOption }) {
  if (option.icon) return option.icon;
  if (option.iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={option.iconUrl}
        className="h-5 w-5 shrink-0 rounded-full object-cover"
        alt=""
      />
    );
  }
  if (option.iconEmoji) {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none">
        {option.iconEmoji}
      </span>
    );
  }
  return null;
}

export function CampaignMultiValueSelect({
  value,
  onChange,
  options,
  placeholder,
  onOpen,
  loading = false,
  loadingLabel = "Loading options…",
  canCreateOption,
  onCreateOption,
  createOptionLabel = "Verify and add this invite link",
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: CampaignSelectOption[];
  placeholder: string;
  onOpen?: () => void;
  loading?: boolean;
  loadingLabel?: string;
  canCreateOption?: (input: string) => boolean;
  onCreateOption?: (input: string) => void | Promise<void>;
  createOptionLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const selectedIds = new Set(value || []);
  const selected = options.filter((option) => selectedIds.has(option.value));
  const filteredOptions = options.filter((option) =>
    `${option.label} ${option.description || ""} ${option.searchText || ""}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const canCreate = Boolean(
    onCreateOption && search.trim() && canCreateOption?.(search.trim()),
  );

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportPadding = 16;
      const width = Math.min(
        Math.max(rect.width, 280),
        window.innerWidth - viewportPadding * 2,
      );
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        window.innerWidth - width - viewportPadding,
      );
      const estimatedHeight = 360;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const showAbove =
        spaceBelow < 220 && rect.top > estimatedHeight + viewportPadding;
      setMenuStyle({
        left,
        width,
        top: showAbove
          ? Math.max(viewportPadding, rect.top - estimatedHeight - 8)
          : Math.min(
              window.innerHeight - estimatedHeight - viewportPadding,
              rect.bottom + 8,
            ),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const toggle = (optionValue: string) =>
    onChange(
      selectedIds.has(optionValue)
        ? value.filter((item) => item !== optionValue)
        : [...value, optionValue],
    );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((current) => {
            if (current) setSearch("");
            else onOpen?.();
            return !current;
          });
        }}
        className="flex min-h-11 w-full flex-wrap items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white"
      >
        {selected.length ? (
          selected.map((option) => (
            <span
              key={option.value}
              className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-neutral-600 px-2 py-0.5 text-xs"
            >
              <SelectOptionVisual option={option} />
              <span
                className={`${option.badgeClassName ? "" : "truncate"} ${option.badgeClassName ?? ""}`}
              >
                {option.labelContent ?? option.label}
              </span>
            </span>
          ))
        ) : loading ? (
          <span className="inline-flex items-center gap-2 text-neutral-400">
            <LoaderCircle size={15} className="animate-spin" /> {loadingLabel}
          </span>
        ) : (
          <span className="text-neutral-400">{placeholder}</span>
        )}
      </button>
      {open && menuStyle
        ? createPortal(
            <div className="fixed inset-0 z-[180]">
              <button
                type="button"
                aria-label="Close select"
                className="absolute inset-0 cursor-default bg-transparent"
                onClick={() => {
                  setOpen(false);
                  setSearch("");
                }}
              />
              <div
                className="absolute overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
                style={{ ...menuStyle, maxHeight: 360 }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="border-b border-neutral-800 p-2">
                  <Input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setOpen(false);
                        setSearch("");
                      }
                    }}
                    placeholder="Search..."
                    className="bg-neutral-950"
                  />
                </div>
                <div className="max-h-[300px] overflow-auto p-1">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-neutral-400">
                      <LoaderCircle size={15} className="animate-spin" />
                      {loadingLabel}
                    </div>
                  ) : null}
                  {!loading &&
                    filteredOptions.map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => toggle(option.value)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800"
                      >
                        <SelectOptionVisual option={option} />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`${option.badgeClassName ? "" : "block truncate"} ${option.badgeClassName ?? ""}`}
                          >
                            {option.labelContent ?? option.label}
                          </span>
                          {option.description ? (
                            <span className="block truncate text-xs text-neutral-500">
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-blue-300">
                          {selectedIds.has(option.value) ? "✓" : ""}
                        </span>
                      </button>
                    ))}
                  {!loading && canCreate ? (
                    <button
                      type="button"
                      disabled={creating}
                      onClick={async () => {
                        if (!onCreateOption) return;
                        setCreating(true);
                        try {
                          await onCreateOption(search.trim());
                          setSearch("");
                          setOpen(false);
                        } catch {
                          // The registration hook presents the verification error.
                        } finally {
                          setCreating(false);
                        }
                      }}
                      className="w-full border-t border-neutral-800 px-3 py-2 text-left text-sm font-medium text-blue-300 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {creating ? "Verifying invite link…" : createOptionLabel}
                    </button>
                  ) : null}
                  {!loading && !filteredOptions.length && !canCreate ? (
                    <p className="px-3 py-3 text-center text-sm text-neutral-500">
                      No options found
                    </p>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
