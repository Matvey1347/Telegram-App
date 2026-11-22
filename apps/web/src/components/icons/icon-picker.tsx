"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, Search, Upload } from "lucide-react";
import { iconsApi, type Icon, type ResolvedEmoji } from "@/lib/api";
import { iconToResolvedEmoji } from "@/lib/resolved-emoji";
import {
  emojiCategoryLabels,
  emojiIcons,
  type EmojiCategory,
  type EmojiIcon,
} from "@/lib/emoji-icons";
import { Button, Input } from "@/components/ui/primitives";
import { IconAvatar } from "./icon-avatar";
import {
  clipboardImageFile,
  IconImageUploadPanel,
  type IconUploadPreview,
} from "./icon-image-upload-panel";
import {
  emojiLocalizedSearchTerms,
  uiCopy,
  type UiLocale,
} from "@/lib/ui-i18n";
import { useOptionalI18n } from "@/providers/i18n-provider";
import {
  IconPickerBrowser,
  type IconSection,
  type RecentIcon,
  type RecentSavedIcon,
  type RecentStandardIcon,
} from "./icon-picker-browser";

type IconPickerProps = {
  iconId?: string | null;
  icon?: Icon | ResolvedEmoji | null;
  onChange: (iconId: string | null, icon?: ResolvedEmoji | null) => void;
  onEmojiChange?: (emoji: string | null) => void;
  buttonLabel?: string;
  iconOnly?: boolean;
  ariaLabel?: string;
  className?: string;
  iconClassName?: string;
  compact?: boolean;
  bare?: boolean;
  disabled?: boolean;
  allowImages?: boolean;
  onPendingChange?: (pending: boolean) => void;
  uiLocale?: UiLocale;
};
const tabOrder = ["icons", "upload"] as const;
type Tab = (typeof tabOrder)[number];
function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

const RECENT_KEY = "telegram-system-recent-icons";
const RECENT_LIMIT = 12;

function loadRecentIcons(): RecentIcon[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentIcon[];
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

function isStandardRecent(icon: RecentIcon): icon is RecentStandardIcon {
  return icon.kind === "standard";
}

function matchesSearch(icon: EmojiIcon, search: string, locale?: UiLocale) {
  if (!search) return true;
  const haystack =
    `${icon.emoji} ${icon.name} ${icon.keywords.join(" ")} ${emojiCategoryLabels[icon.category]} ${emojiLocalizedSearchTerms(icon.name, icon.category, locale)}`.toLowerCase();
  return haystack.includes(search);
}

function matchesRecentStandard(
  item: RecentStandardIcon,
  search: string,
  locale?: UiLocale,
) {
  if (!search) return true;
  const haystack =
    `${item.emoji} ${item.name} ${item.keywords.join(" ")} ${emojiCategoryLabels[item.category]} ${emojiLocalizedSearchTerms(item.name, item.category, locale)}`.toLowerCase();
  return haystack.includes(search);
}

function selectableSavedIcon(
  icon: RecentSavedIcon["icon"],
  allowImages: boolean,
) {
  return (
    (allowImages && icon.type === "image") ||
    (icon.type === "emoji" && Boolean(icon.emoji?.includes("tg://emoji?id=")))
  );
}

function matchesRecentSaved(item: RecentSavedIcon, search: string) {
  if (!search) return true;
  return item.icon.name.toLowerCase().includes(search);
}

export function IconPicker({
  iconId,
  icon,
  onChange,
  onEmojiChange,
  buttonLabel,
  iconOnly = false,
  ariaLabel,
  className = "",
  iconClassName = "",
  compact = false,
  bare = false,
  disabled = false,
  allowImages = true,
  onPendingChange,
  uiLocale,
}: IconPickerProps) {
  const i18n = useOptionalI18n();
  const effectiveUiLocale = uiLocale ?? i18n?.locale;
  const ui = uiCopy(effectiveUiLocale);
  const resolvedButtonLabel = buttonLabel ?? ui.addIcon;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("icons");
  const [search, setSearch] = useState("");
  const [upload, setUpload] = useState<IconUploadPreview | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [saveReusableOpen, setSaveReusableOpen] = useState(false);
  const [recentIcons, setRecentIcons] = useState<RecentIcon[]>(() =>
    loadRecentIcons(),
  );
  const [activeSection, setActiveSection] = useState<IconSection>("recent");
  const [standardIconsReady, setStandardIconsReady] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const [optimisticIcon, setOptimisticIcon] = useState<Icon | null>(null);
  const mountedRef = useRef(true);
  const previousIconIdRef = useRef(iconId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<
    Partial<Record<IconSection, HTMLDivElement | null>>
  >({});

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const { data: selectedIcon } = useQuery({
    queryKey: ["icon", iconId],
    queryFn: () => iconsApi.get(iconId as string),
    enabled: Boolean(iconId) && !icon && !optimisticIcon,
  });

  const iconsQuery = useQuery({
    queryKey: ["icons", search],
    queryFn: () => iconsApi.list(search || undefined),
    enabled: open && tab === "icons",
  });

  const customIcons = useMemo(
    () =>
      (iconsQuery.data ?? []).filter((icon) =>
        selectableSavedIcon(icon, allowImages),
      ),
    [allowImages, iconsQuery.data],
  );

  const createEmojiMutation = useMutation({
    onMutate: () => onPendingChange?.(true),
    mutationFn: async (payload: EmojiIcon) => ({
      icon: await iconsApi.createEmoji({
        name: payload.name,
        emoji: payload.emoji,
      }),
      payload,
    }),
    onSuccess: ({ icon, payload }) => {
      if (!mountedRef.current) return;
      const recentItem: RecentStandardIcon = {
        kind: "standard",
        name: payload.name,
        emoji: payload.emoji,
        category: payload.category,
        keywords: payload.keywords,
      };
      qc.setQueryData(["icon", icon.id], icon);
      setOptimisticIcon(icon);
      onChange(icon.id, iconToResolvedEmoji(icon));
      onPendingChange?.(false);
      setRecentIcons((prev) =>
        [
          recentItem,
          ...prev.filter(
            (item) =>
              !(item.kind === "standard" && item.emoji === payload.emoji),
          ),
        ].slice(0, RECENT_LIMIT),
      );
      setOpen(false);
      setSearch("");
      qc.invalidateQueries({ queryKey: ["icons"] });
    },
    onError: () => setOptimisticIcon(null),
    onSettled: () => {
      if (mountedRef.current) onPendingChange?.(false);
    },
  });

  const createCustomMutation = useMutation({
    onMutate: () => onPendingChange?.(true),
    mutationFn: iconsApi.createCustom,
    onSuccess: (icon) => {
      if (!mountedRef.current) return;
      const recentItem: RecentSavedIcon = {
        kind: "saved",
        icon: {
          id: icon.id,
          type: icon.type,
          name: icon.name,
          emoji: icon.emoji,
          imageUrl: icon.imageUrl,
        },
      };
      qc.setQueryData(["icon", icon.id], icon);
      setOptimisticIcon(icon);
      onChange(icon.id, iconToResolvedEmoji(icon));
      onPendingChange?.(false);
      setRecentIcons((prev) =>
        [
          recentItem,
          ...prev.filter(
            (item) => !(item.kind === "saved" && item.icon.id === icon.id),
          ),
        ].slice(0, RECENT_LIMIT),
      );
      setOpen(false);
      setUpload(null);
      setUploadName("");
      setSaveReusableOpen(false);
      setSearch("");
      qc.invalidateQueries({ queryKey: ["icons"] });
    },
    onSettled: () => {
      if (mountedRef.current) onPendingChange?.(false);
    },
  });

  const createTemporaryImageMutation = useMutation({
    onMutate: () => onPendingChange?.(true),
    mutationFn: iconsApi.createTemporaryImage,
    onSuccess: (icon) => {
      if (!mountedRef.current) return;
      qc.setQueryData(["icon", icon.id], icon);
      setOptimisticIcon(icon);
      onChange(icon.id, iconToResolvedEmoji(icon));
      onPendingChange?.(false);
      setOpen(false);
      setUpload(null);
      setUploadName("");
      setSaveReusableOpen(false);
      setSearch("");
    },
    onSettled: () => {
      if (mountedRef.current) onPendingChange?.(false);
    },
  });

  const { mutate: uploadFile, isPending: isUploading } = useMutation({
    mutationFn: iconsApi.upload,
    onSuccess: (result, file) => {
      setUpload({
        imageUrl: result.imageUrl,
        fileName: stripExtension(file.name || "icon"),
      });
      setUploadName("");
      setSaveReusableOpen(false);
      setTab("upload");
    },
  });

  const filteredStandardIcons = useMemo(() => {
    const value = search.trim().toLowerCase();
    return emojiIcons.filter((item) =>
      matchesSearch(item, value, effectiveUiLocale),
    );
  }, [effectiveUiLocale, search]);

  const normalizedSearch = search.trim().toLowerCase();
  const isSearching = normalizedSearch.length > 0;

  const emojiByCategory = useMemo(() => {
    const value = search.trim().toLowerCase();
    const grouped: Record<EmojiCategory, EmojiIcon[]> = {
      people: [],
      nature: [],
      food: [],
      activity: [],
      travel: [],
      objects: [],
      symbols: [],
      flags: [],
    };
    for (const icon of emojiIcons) {
      if (!matchesSearch(icon, value, effectiveUiLocale)) continue;
      grouped[icon.category].push(icon);
    }
    return grouped;
  }, [effectiveUiLocale, search]);

  const currentIcon =
    iconToResolvedEmoji(optimisticIcon) ??
    iconToResolvedEmoji(icon) ??
    (iconId ? iconToResolvedEmoji(selectedIcon) : null);

  useEffect(() => {
    if (previousIconIdRef.current !== iconId) {
      previousIconIdRef.current = iconId;
      // External changes (new post, another post, inherited group icon)
      // replace any optimistic selection from the previous editor state.
      setOptimisticIcon(null);
    }
  }, [iconId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(recentIcons.slice(0, RECENT_LIMIT)),
    );
  }, [recentIcons]);

  useEffect(() => {
    if (!open || tab !== "icons") return;

    const timeout = window.setTimeout(() => setStandardIconsReady(true), 0);
    return () => window.clearTimeout(timeout);
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = 360;
      const height = Math.min(480, viewportHeight - 32);
      const gap = 8;
      const left = Math.min(
        Math.max(16, triggerRect.left),
        Math.max(16, viewportWidth - width - 16),
      );
      const spaceBelow = viewportHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      const openUp = spaceBelow < height && spaceAbove > spaceBelow;
      const top = openUp
        ? Math.max(16, triggerRect.top - height - gap)
        : Math.min(viewportHeight - height - 16, triggerRect.bottom + gap);
      setPanelStyle({
        position: "fixed",
        top,
        left,
        width,
        maxHeight: height,
      });
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const handleFile = useCallback(
    (file?: File) => {
      if (!allowImages) return;
      if (!file) return;
      if (!file.type.startsWith("image/")) return;
      setUpload(null);
      setTab("upload");
      uploadFile(file);
    },
    [allowImages, uploadFile],
  );

  useEffect(() => {
    if (!open || tab !== "upload") return;

    const onPaste = (event: ClipboardEvent) => {
      const file = clipboardImageFile(event.clipboardData);
      if (file) {
        event.preventDefault();
        handleFile(file);
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFile, open, tab]);

  const uploadDisabled =
    isUploading ||
    createCustomMutation.isPending ||
    createTemporaryImageMutation.isPending;

  const standardRecent = useMemo(
    () =>
      recentIcons
        .filter(isStandardRecent)
        .filter((item) =>
          matchesRecentStandard(item, normalizedSearch, effectiveUiLocale),
        ),
    [effectiveUiLocale, normalizedSearch, recentIcons],
  );
  const savedRecent = useMemo(
    () =>
      recentIcons
        .filter((icon): icon is RecentSavedIcon => icon.kind === "saved")
        .filter((item) => selectableSavedIcon(item.icon, allowImages))
        .filter((item) => matchesRecentSaved(item, normalizedSearch)),
    [allowImages, normalizedSearch, recentIcons],
  );
  const hasRecentItems = standardRecent.length > 0 || savedRecent.length > 0;
  const totalSearchResults = filteredStandardIcons.length + customIcons.length;

  const selectEmoji = (item: RecentStandardIcon | EmojiIcon) => {
    setOpen(false);
    if (onEmojiChange) {
      const recentItem: RecentStandardIcon = {
        kind: "standard",
        name: item.name,
        emoji: item.emoji,
        category: item.category,
        keywords: item.keywords,
      };
      onEmojiChange(item.emoji);
      setRecentIcons((prev) =>
        [
          recentItem,
          ...prev.filter(
            (current) =>
              !(current.kind === "standard" && current.emoji === item.emoji),
          ),
        ].slice(0, RECENT_LIMIT),
      );
      setSearch("");
      return;
    }
    setOptimisticIcon({
      id: "",
      type: "emoji",
      name: item.name,
      emoji: item.emoji,
    });
    createEmojiMutation.mutate(item);
  };

  const selectRecentSaved = (item: RecentSavedIcon) => {
    setOptimisticIcon(item.icon);
    qc.setQueryData(["icon", item.icon.id], item.icon);
    onChange(item.icon.id, iconToResolvedEmoji(item.icon));
    setRecentIcons((prev) =>
      [
        item,
        ...prev.filter(
          (current) =>
            !(current.kind === "saved" && current.icon.id === item.icon.id),
        ),
      ].slice(0, RECENT_LIMIT),
    );
    setOpen(false);
  };
  const selectCustomIcon = (icon: Icon) => {
    const recentItem: RecentSavedIcon = {
      kind: "saved",
      icon: {
        id: icon.id,
        type: icon.type,
        name: icon.name,
        emoji: icon.emoji,
        imageUrl: icon.imageUrl,
      },
    };
    setRecentIcons((prev) =>
      [
        recentItem,
        ...prev.filter(
          (current) =>
            !(current.kind === "saved" && current.icon.id === icon.id),
        ),
      ].slice(0, RECENT_LIMIT),
    );
    setOptimisticIcon(icon);
    qc.setQueryData(["icon", icon.id], icon);
    onChange(icon.id, iconToResolvedEmoji(icon));
    setOpen(false);
  };

  const scrollToSection = (section: IconSection) => {
    setActiveSection(section);
    sectionRefs.current[section]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  useEffect(() => {
    if (!open || tab !== "icons") return;

    const root = scrollAreaRef.current;
    if (!root) return;

    const updateActiveSection = () => {
      const entries = (
        Object.entries(sectionRefs.current) as Array<
          [IconSection, HTMLDivElement | null]
        >
      )
        .filter(([, node]) => Boolean(node))
        .map(([section, node]) => ({
          section,
          top: Math.abs((node?.offsetTop ?? 0) - root.scrollTop - 12),
        }))
        .sort((a, b) => a.top - b.top);

      if (entries[0]) setActiveSection(entries[0].section);
    };

    updateActiveSection();
    root.addEventListener("scroll", updateActiveSection, { passive: true });
    return () => root.removeEventListener("scroll", updateActiveSection);
  }, [
    customIcons.length,
    filteredStandardIcons.length,
    open,
    savedRecent.length,
    standardIconsReady,
    standardRecent.length,
    tab,
  ]);

  const closePicker = () => {
    setOpen(false);
    setTab("icons");
    setSearch("");
    setUpload(null);
    setUploadName("");
    setSaveReusableOpen(false);
    setActiveSection("recent");
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        aria-label={
          ariaLabel ?? (currentIcon ? ui.changeIcon : resolvedButtonLabel)
        }
        onClick={() => {
          if (disabled) return;
          if (open) {
            closePicker();
            return;
          }
          setStandardIconsReady(false);
          setOpen(true);
        }}
        className={`${
          bare
            ? `inline-flex items-center justify-center text-neutral-100 hover:opacity-80 ${className}`
            : compact
              ? `flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-100 hover:bg-neutral-800 ${className}`
              : `flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800 ${className}`
        }${disabled ? " cursor-not-allowed opacity-50" : ""}`}
      >
        {currentIcon ? (
          <IconAvatar
            icon={currentIcon}
            label={currentIcon.name ?? undefined}
            size={compact ? "sm" : "xs"}
            bordered={!(compact || bare)}
            className={`${bare ? "!h-5 !w-5 !bg-transparent !border-0 !rounded-none !text-base" : ""} ${iconClassName}`}
          />
        ) : compact && buttonLabel && !iconOnly ? (
          <span
            aria-hidden="true"
            className={`text-base leading-none ${iconClassName}`}
          >
            {buttonLabel}
          </span>
        ) : (
          <Plus size={bare ? 14 : 16} />
        )}
        {!compact && !bare && !iconOnly ? (
          <span>{currentIcon ? ui.changeIcon : resolvedButtonLabel}</span>
        ) : null}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              style={panelStyle}
              className="z-[100] flex overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl"
            >
              <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
                      {tabOrder
                        .filter((item) => allowImages || item !== "upload")
                        .map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              if (item === "icons" && tab !== "icons")
                                setStandardIconsReady(false);
                              setTab(item);
                            }}
                            className={`rounded-md px-2.5 py-1 text-sm capitalize ${tab === item ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white"}`}
                          >
                            {ui[item]}
                          </button>
                        ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOptimisticIcon(null);
                        if (onEmojiChange) {
                          onEmojiChange(null);
                        } else {
                          onChange(null, null);
                        }
                        closePicker();
                      }}
                      className="mr-1 text-sm text-neutral-400 hover:text-white"
                    >
                      {ui.remove}
                    </button>
                  </div>

                  <div className="mb-1.5 flex items-center gap-2">
                    {tab === "icons" ? (
                      <div className="relative min-w-0 flex-1">
                        <Search
                          size={16}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                        />
                        <Input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder={ui.searchIcon}
                          className="pl-9 py-2"
                        />
                      </div>
                    ) : (
                      <>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            handleFile(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isUploading}
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full justify-center"
                        >
                          <span className="flex items-center gap-2">
                            {isUploading ? (
                              <LoaderCircle
                                size={14}
                                className="animate-spin"
                              />
                            ) : (
                              <Upload size={14} />
                            )}
                            {ui.upload}
                          </span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {tab === "icons" ? (
                  <IconPickerBrowser
                    scrollAreaRef={scrollAreaRef}
                    setSectionRef={(section, node) => {
                      sectionRefs.current[section] = node;
                    }}
                    ui={ui}
                    activeSection={activeSection}
                    allowImages={allowImages}
                    customIcons={customIcons}
                    emojiByCategory={emojiByCategory}
                    filteredStandardIcons={filteredStandardIcons}
                    hasRecentItems={hasRecentItems}
                    isSearching={isSearching}
                    loadingCustomIcons={iconsQuery.isLoading}
                    savedRecent={savedRecent}
                    scrollToSection={scrollToSection}
                    selectCustomIcon={selectCustomIcon}
                    selectRecentSaved={selectRecentSaved}
                    selectRecentStandard={selectEmoji}
                    selectStandardIcon={selectEmoji}
                    standardIconsReady={standardIconsReady}
                    standardRecent={standardRecent}
                    totalSearchResults={totalSearchResults}
                  />
                ) : null}

                {tab === "upload" ? (
                  <IconImageUploadPanel
                    copy={ui}
                    upload={upload}
                    uploadName={uploadName}
                    uploading={isUploading}
                    disabled={uploadDisabled}
                    saveReusableOpen={saveReusableOpen}
                    onChooseFile={() => fileInputRef.current?.click()}
                    onFile={handleFile}
                    onUploadName={setUploadName}
                    onBeginSaveReusable={(name) => {
                      setUploadName(name);
                      setSaveReusableOpen(true);
                    }}
                    onUseOnce={(item) =>
                      createTemporaryImageMutation.mutate({
                        imageUrl: item.imageUrl,
                        fileName: item.fileName,
                      })
                    }
                    onSaveReusable={(item, name) =>
                      createCustomMutation.mutate({
                        name,
                        imageUrl: item.imageUrl,
                      })
                    }
                    onBack={() => {
                      if (saveReusableOpen) {
                        setSaveReusableOpen(false);
                        setUploadName("");
                      } else {
                        setUpload(null);
                      }
                    }}
                  />
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
