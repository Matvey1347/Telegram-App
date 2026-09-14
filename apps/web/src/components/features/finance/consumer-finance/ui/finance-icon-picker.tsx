"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, LoaderCircle, Plus, Search, Upload } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { emojiIcons, type EmojiCategory } from "@/lib/emoji-icons";
import type {
  ConsumerFinanceCustomIcon,
  ResolvedEmoji,
} from "@telegram-system/shared";
import { consumerFinanceLedgerApi } from "@/lib/features/finance/consumer-finance-ledger-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import type { FinanceLocale } from "../i18n/core";
import { Button, Input } from "./finance-controls";
import { FinanceIconAvatar } from "./finance-icon-avatar";
import { financeIconPickerCopy } from "./finance-icon-picker-i18n";

type FinanceIconPickerProps = {
  botId: string;
  source?: string | null;
  onChange: (source: string | null) => void;
  buttonLabel?: string;
  ariaLabel?: string;
  className?: string;
  compact?: boolean;
  bare?: boolean;
  disabled?: boolean;
  uiLocale?: FinanceLocale;
};

type Tab = "icons" | "image";
const categories: EmojiCategory[] = [
  "people",
  "nature",
  "food",
  "activity",
  "travel",
  "objects",
  "symbols",
  "flags",
];

function iconFromSource(source?: string | null): ResolvedEmoji | null {
  if (!source) return null;
  if (source.startsWith("image:") && source.slice(6))
    return { type: "image", id: source, url: source.slice(6) };
  return { type: "unicode", value: source };
}

function imageName(file: File) {
  return file.name.replace(/\.[^.]+$/, "") || "image";
}

export function IconPicker({
  botId,
  source,
  onChange,
  buttonLabel,
  ariaLabel,
  className = "",
  compact = false,
  bare = false,
  disabled = false,
  uiLocale = "en",
}: FinanceIconPickerProps) {
  const labels = financeIconPickerCopy(uiLocale);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("icons");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<EmojiCategory>("people");
  const [uploaded, setUploaded] = useState<{
    imageUrl: string;
    fileName: string;
  } | null>(null);
  const [saveReusable, setSaveReusable] = useState(false);
  const [name, setName] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const currentIcon = iconFromSource(source);
  const customIcons = useQuery({
    queryKey: consumerFinanceKeys.customIcons(botId),
    queryFn: () => consumerFinanceLedgerApi.customIcons(botId),
    enabled: open && tab === "icons",
  });
  const upload = useMutation({
    mutationFn: (file: File) =>
      consumerFinanceLedgerApi.uploadCustomIcon(botId, file),
    onSuccess: (result, file) => {
      setUploaded({ imageUrl: result.imageUrl, fileName: imageName(file) });
      setName("");
      setSaveReusable(false);
      setTab("image");
    },
  });
  const close = () => {
    setOpen(false);
    setTab("icons");
    setSearch("");
    setUploaded(null);
    setName("");
    setSaveReusable(false);
  };
  const save = useMutation({
    mutationFn: (payload: { name: string; imageUrl: string }) =>
      consumerFinanceLedgerApi.saveCustomIcon(botId, payload),
    onSuccess: (item) => {
      queryClient.setQueryData<ConsumerFinanceCustomIcon[]>(
        consumerFinanceKeys.customIcons(botId),
        (previous) => [
          item,
          ...(previous ?? []).filter((row) => row.id !== item.id),
        ],
      );
      onChange(`image:${item.imageUrl}`);
      close();
    },
  });
  const options = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return emojiIcons.filter((item) =>
      !query
        ? item.category === category
        : [item.name, ...item.keywords].some((term) =>
            term.toLocaleLowerCase().includes(query),
          ),
    );
  }, [category, search]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(360, window.innerWidth - 32);
      const height = Math.min(500, window.innerHeight - 32);
      const left = Math.min(
        Math.max(16, rect.left),
        Math.max(16, window.innerWidth - width - 16),
      );
      const openUp =
        window.innerHeight - rect.bottom < height &&
        rect.top > window.innerHeight - rect.bottom;
      setPanelStyle({
        position: "fixed",
        zIndex: 100,
        width,
        maxHeight: height,
        left,
        top: openUp
          ? Math.max(16, rect.top - height - 8)
          : Math.min(window.innerHeight - height - 16, rect.bottom + 8),
      });
    };
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      )
        close();
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", outside);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", outside);
    };
  }, [open]);

  const chooseFile = (file?: File) => {
    if (file?.type.startsWith("image/")) upload.mutate(file);
  };
  const triggerClass = bare
    ? `inline-flex items-center justify-center text-neutral-100 hover:opacity-80 ${className}`
    : compact
      ? `flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-100 hover:bg-neutral-800 ${className}`
      : `flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800 ${className}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={
          ariaLabel ?? (currentIcon ? labels.changeIcon : labels.addIcon)
        }
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className={`${triggerClass}${disabled ? " cursor-not-allowed opacity-50" : ""}`}
      >
        {currentIcon ? (
          <FinanceIconAvatar
            icon={currentIcon}
            label={buttonLabel}
            size={compact ? "sm" : "xs"}
            bordered={!(compact || bare)}
          />
        ) : (
          <Plus size={bare ? 14 : 16} />
        )}
        {!compact && !bare ? (
          <span>
            {buttonLabel ?? (currentIcon ? labels.changeIcon : labels.addIcon)}
          </span>
        ) : null}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              data-finance-icon-picker-panel="true"
              style={panelStyle}
              className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 p-3 shadow-2xl"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex rounded-lg border border-neutral-800 bg-neutral-950 p-1">
                  {(["icons", "image"] as Tab[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTab(value)}
                      className={`rounded-md px-2.5 py-1 text-sm ${tab === value ? "bg-blue-900/60 text-white" : "text-neutral-400 hover:text-white"}`}
                    >
                      {labels[value]}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
                    close();
                  }}
                  className="text-sm text-neutral-400 hover:text-white"
                >
                  {labels.remove}
                </button>
              </div>
              {tab === "icons" ? (
                <>
                  <label className="relative mt-3 block">
                    <Search
                      className="pointer-events-none absolute left-3 top-2.5 text-neutral-500"
                      size={16}
                    />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={labels.searchIcon}
                      className="pl-9"
                      autoFocus
                    />
                  </label>
                  {!search ? (
                    <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
                      {categories.map((value) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={category === value}
                          onClick={() => setCategory(value)}
                          className="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 aria-pressed:bg-blue-900/60"
                        >
                          {labels[value]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
                    <div className="grid grid-cols-8 gap-1" role="listbox">
                      {options.map((item) => (
                        <button
                          key={`${item.category}:${item.name}:${item.emoji}`}
                          type="button"
                          role="option"
                          title={item.name}
                          onClick={() => {
                            onChange(item.emoji);
                            close();
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-neutral-800"
                        >
                          {item.emoji}
                        </button>
                      ))}
                    </div>
                    {!options.length ? (
                      <p className="py-5 text-center text-sm text-neutral-500">
                        {labels.noStandardIcons}
                      </p>
                    ) : null}
                    <section className="mt-3 border-t border-neutral-800 pt-3">
                      <p className="mb-2 text-sm font-medium text-neutral-300">
                        {labels.customIcons}
                      </p>
                      {customIcons.isLoading ? (
                        <LoaderCircle
                          className="mx-auto my-4 animate-spin text-blue-400"
                          size={20}
                        />
                      ) : customIcons.data?.length ? (
                        <div className="grid grid-cols-2 gap-2">
                          {customIcons.data.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              title={item.name}
                              onClick={() => {
                                onChange(`image:${item.imageUrl}`);
                                close();
                              }}
                              className="flex min-w-0 items-center gap-2 rounded-lg p-1 text-left hover:bg-neutral-800"
                            >
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="h-8 w-8 rounded-md object-cover"
                              />
                              <span className="truncate text-xs text-neutral-300">
                                {item.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-neutral-500">
                          {labels.noCustomIcons}
                        </p>
                      )}
                    </section>
                  </div>
                </>
              ) : (
                <div
                  className="mt-3 flex min-h-0 flex-1 flex-col"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    chooseFile(
                      Array.from(event.dataTransfer.files).find((file) =>
                        file.type.startsWith("image/"),
                      ),
                    );
                  }}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => {
                      chooseFile(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  {upload.isPending ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 text-sm text-neutral-300">
                      <LoaderCircle
                        className="animate-spin text-blue-400"
                        size={24}
                      />
                      {labels.uploadingImage}
                    </div>
                  ) : !uploaded ? (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-950 p-6 text-neutral-300 hover:bg-neutral-800"
                    >
                      <ImagePlus size={22} />
                      {labels.uploadImage}
                      <span className="text-xs text-neutral-500">
                        {labels.dropImage}
                      </span>
                    </button>
                  ) : (
                    <>
                      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                        <p className="mb-2 text-sm text-neutral-400">
                          {labels.preview}
                        </p>
                        <div className="flex items-center gap-3">
                          <img
                            src={uploaded.imageUrl}
                            alt=""
                            className="h-16 w-16 rounded-lg object-cover"
                          />
                          <p className="min-w-0 truncate text-sm text-neutral-300">
                            {saveReusable ? labels.iconName : labels.readyOnce}
                          </p>
                        </div>
                      </div>
                      {saveReusable ? (
                        <label className="mt-3 block text-sm text-neutral-300">
                          {labels.iconName}
                          <Input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder={labels.iconNameExample}
                            className="mt-1"
                            autoFocus
                          />
                        </label>
                      ) : null}
                      <div className="mt-3 grid gap-2">
                        <Button
                          type="button"
                          disabled={
                            save.isPending || (saveReusable && !name.trim())
                          }
                          onClick={() =>
                            saveReusable
                              ? save.mutate({
                                  name: name.trim(),
                                  imageUrl: uploaded.imageUrl,
                                })
                              : (onChange(`image:${uploaded.imageUrl}`),
                                close())
                          }
                        >
                          {save.isPending ? (
                            <LoaderCircle size={16} className="animate-spin" />
                          ) : null}
                          {saveReusable ? labels.save : labels.useOnce}
                        </Button>
                        {!saveReusable ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setSaveReusable(true)}
                          >
                            <Upload size={16} />
                            {labels.saveCustomIcon}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setUploaded(null);
                            setSaveReusable(false);
                            setName("");
                          }}
                        >
                          {labels.uploadImage}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {upload.isError || save.isError ? (
                <p className="mt-2 text-xs text-rose-300">
                  {labels.uploadImage}
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
