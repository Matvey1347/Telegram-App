"use client";

import {
  Clock3,
  Dumbbell,
  Flag,
  Grid2x2,
  Leaf,
  Package,
  Plane,
  Shapes,
  Smile,
  Utensils,
} from "lucide-react";
import { type Icon } from "@/lib/api";
import { iconToResolvedEmoji } from "@/lib/resolved-emoji";
import {
  emojiCategoryLabels,
  type EmojiCategory,
  type EmojiIcon,
} from "@/lib/emoji-icons";
import { IconAvatar } from "./icon-avatar";
import type { uiCopy } from "@/lib/ui-i18n";
import type { RefObject } from "react";

export type RecentStandardIcon = {
  kind: "standard";
  name: string;
  emoji: string;
  category: EmojiCategory;
  keywords: string[];
};
export type RecentSavedIcon = {
  kind: "saved";
  icon: {
    id: string;
    type: "emoji" | "image";
    name: string;
    emoji?: string | null;
    imageUrl?: string | null;
  };
};

export type RecentIcon = RecentStandardIcon | RecentSavedIcon;
export type IconSection = "recent" | EmojiCategory | "custom";

const sectionTabs = [
  { section: "recent", icon: Clock3 },
  { section: "people", icon: Smile },
  { section: "nature", icon: Leaf },
  { section: "food", icon: Utensils },
  { section: "activity", icon: Dumbbell },
  { section: "travel", icon: Plane },
  { section: "objects", icon: Package },
  { section: "symbols", icon: Shapes },
  { section: "flags", icon: Flag },
  { section: "custom", icon: Grid2x2 },
] as const;

export function IconPickerBrowser({
  scrollAreaRef,
  setSectionRef,
  ui,
  activeSection,
  allowImages,
  customIcons,
  emojiByCategory,
  filteredStandardIcons,
  hasRecentItems,
  isSearching,
  loadingCustomIcons,
  savedRecent,
  scrollToSection,
  selectCustomIcon,
  selectRecentSaved,
  selectRecentStandard,
  selectStandardIcon,
  standardIconsReady,
  standardRecent,
  totalSearchResults,
}: {
  scrollAreaRef: RefObject<HTMLDivElement | null>;
  setSectionRef: (section: IconSection, node: HTMLDivElement | null) => void;
  ui: ReturnType<typeof uiCopy>;
  activeSection: IconSection;
  allowImages: boolean;
  customIcons: Icon[];
  emojiByCategory: Record<EmojiCategory, EmojiIcon[]>;
  filteredStandardIcons: EmojiIcon[];
  hasRecentItems: boolean;
  isSearching: boolean;
  loadingCustomIcons: boolean;
  savedRecent: RecentSavedIcon[];
  scrollToSection: (section: IconSection) => void;
  selectCustomIcon: (icon: Icon) => void;
  selectRecentSaved: (item: RecentSavedIcon) => void;
  selectRecentStandard: (item: RecentStandardIcon) => void;
  selectStandardIcon: (item: EmojiIcon) => void;
  standardIconsReady: boolean;
  standardRecent: RecentStandardIcon[];
  totalSearchResults: number;
}) {
  return (
    <>
      <div
        ref={scrollAreaRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-neutral-950 px-4 py-2 [scrollbar-gutter:stable] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {isSearching ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-sm font-medium text-neutral-300">
                {ui.results}
              </p>
              <p className="text-xs text-neutral-500">
                {totalSearchResults} {ui.items}
              </p>
            </div>
            {loadingCustomIcons ? (
              <p className="text-sm text-neutral-400">{ui.loadingIcons}</p>
            ) : null}
            {totalSearchResults ? (
              <div className="grid grid-cols-8 justify-items-center gap-1 sm:grid-cols-10">
                {filteredStandardIcons.map((item) => (
                  <button
                    key={`${item.category}-${item.name}-${item.emoji}`}
                    type="button"
                    className="group flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-[20px] leading-none hover:border-neutral-700 hover:bg-neutral-900"
                    title={item.name}
                    onClick={() => selectStandardIcon(item)}
                  >
                    {item.emoji}
                  </button>
                ))}
                {customIcons.map((icon) => (
                  <button
                    key={icon.id}
                    type="button"
                    className="group flex h-10 w-10 items-center justify-center rounded-xl border border-transparent hover:border-neutral-700 hover:bg-neutral-900"
                    title={icon.name}
                    onClick={() => selectCustomIcon(icon)}
                  >
                    <IconAvatar
                      icon={iconToResolvedEmoji(icon)}
                      label={icon.name}
                      size="xs"
                      bordered={false}
                      className="!h-[20px] !w-[20px] !rounded-none !bg-transparent !border-0"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-neutral-400">{ui.noIcons}</p>
            )}
          </div>
        ) : (
          <>
            {hasRecentItems ? (
              <div
                ref={(node) => {
                  setSectionRef("recent", node);
                }}
                className="scroll-mt-3"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-sm font-medium text-neutral-300">
                    {ui.recent}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {standardRecent.length + savedRecent.length} {ui.items}
                  </p>
                </div>
                <div className="grid grid-cols-8 justify-items-center gap-1 sm:grid-cols-10">
                  {standardRecent.map((item) => (
                    <button
                      key={`recent-${item.kind}-${item.emoji}`}
                      type="button"
                      className="group flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-[20px] leading-none hover:border-neutral-700 hover:bg-neutral-900"
                      title={item.name}
                      onClick={() => selectRecentStandard(item)}
                    >
                      {item.emoji}
                    </button>
                  ))}
                  {savedRecent.map((item) => (
                    <button
                      key={`recent-${item.kind}-${item.icon.id}`}
                      type="button"
                      className="group flex h-10 w-10 items-center justify-center rounded-xl border border-transparent hover:border-neutral-700 hover:bg-neutral-900"
                      title={item.icon.name}
                      onClick={() => selectRecentSaved(item)}
                    >
                      <IconAvatar
                        icon={iconToResolvedEmoji(item.icon)}
                        label={item.icon.name}
                        size="xs"
                        bordered={false}
                        className="!h-[20px] !w-[20px] !rounded-none !bg-transparent !border-0"
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={hasRecentItems ? "mt-3" : ""}>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-300">
                  {ui.standard}
                </p>
                <p className="text-xs text-neutral-500">
                  {filteredStandardIcons.length} {ui.results.toLowerCase()}
                </p>
              </div>
              {!standardIconsReady ? (
                <div className="rounded-lg border border-neutral-900 bg-neutral-900/50 px-3 py-4 text-sm text-neutral-500">
                  {ui.loadingIcons}
                </div>
              ) : filteredStandardIcons.length ? (
                Object.entries(emojiCategoryLabels).map(([category]) => {
                  const items = emojiByCategory[category as EmojiCategory];
                  if (!items.length) return null;
                  return (
                    <div
                      key={category}
                      ref={(node) => {
                        setSectionRef(category as IconSection, node);
                      }}
                      className={`scroll-mt-3 ${standardRecent.length ? "pt-2" : ""}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-wide text-neutral-500">
                          {ui[category as EmojiCategory]}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {items.length}
                        </p>
                      </div>
                      <div className="mt-2 grid grid-cols-8 justify-items-center gap-1 sm:grid-cols-10">
                        {items.map((item) => (
                          <button
                            key={`${item.category}-${item.name}-${item.emoji}`}
                            type="button"
                            className="group flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-[20px] leading-none hover:border-neutral-700 hover:bg-neutral-900"
                            title={item.name}
                            onClick={() => selectStandardIcon(item)}
                          >
                            {item.emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="mt-3 text-sm text-neutral-400">
                  {ui.noStandardIcons}
                </p>
              )}
            </div>

            {allowImages || customIcons.length ? (
              <div
                ref={(node) => {
                  setSectionRef("custom", node);
                }}
                className="mt-3 scroll-mt-3 border-t border-neutral-800/70 pt-2.5"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-sm font-medium text-neutral-300">
                    {ui.custom}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {customIcons.length} results
                  </p>
                </div>
                {loadingCustomIcons ? (
                  <p className="text-sm text-neutral-400">
                    {ui.loadingCustomIcons}
                  </p>
                ) : null}
                <div className="grid grid-cols-8 justify-items-center gap-1 sm:grid-cols-10">
                  {customIcons.map((icon) => (
                    <button
                      key={icon.id}
                      type="button"
                      className="group flex h-10 w-10 items-center justify-center rounded-xl border border-transparent hover:border-neutral-700 hover:bg-neutral-900"
                      title={icon.name}
                      onClick={() => selectCustomIcon(icon)}
                    >
                      <IconAvatar
                        icon={iconToResolvedEmoji(icon)}
                        label={icon.name}
                        size="xs"
                        bordered={false}
                        className="!h-[20px] !w-[20px] !rounded-none !bg-transparent !border-0"
                      />
                    </button>
                  ))}
                </div>
                {!loadingCustomIcons && !customIcons.length ? (
                  <p className="mt-3 text-sm text-neutral-400">
                    {ui.noCustomIcons}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {!isSearching ? (
        <div className="mt-2 shrink-0 bg-neutral-900/95 py-1 backdrop-blur">
          <div className="flex items-center gap-1.5 overflow-x-auto overflow-y-hidden whitespace-nowrap">
            {sectionTabs
              .filter(
                ({ section }) =>
                  allowImages || customIcons.length > 0 || section !== "custom",
              )
              .map(({ section, icon: Icon }) => {
                const label = ui[section];
                const disabled =
                  section === "recent"
                    ? !hasRecentItems
                    : section === "custom"
                      ? !customIcons.length
                      : !standardIconsReady;
                return (
                  <button
                    key={section}
                    type="button"
                    disabled={disabled}
                    title={label}
                    aria-label={label}
                    onClick={() => scrollToSection(section)}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
                      activeSection === section
                        ? "border-blue-500 bg-blue-500/15 text-blue-200"
                        : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-white"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <Icon size={14} />
                  </button>
                );
              })}
          </div>
        </div>
      ) : null}
    </>
  );
}
